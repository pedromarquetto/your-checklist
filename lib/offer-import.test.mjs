import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareOffers,parseObservationDate,csvString,parseCSV,OFFER_FIELDS,offersToRows} from './core.mjs';
import {latestOffers,filterOffers,partitionOffers,summarizeOfferImport} from './offers.mjs';
const item={id:'f1',name:'Geladeira',room:'Cozinha',category:'Eletros',qty:1,unitBudget:4000};
const row={nome:'Modelo A 400 L',loja:'Loja A',preco:'3.699,90',link:'https://example.com/a',data_consulta:'2026-10-24',nota:'4,7',avaliacoes:'210',fonte:'Site da loja'};
test('scoped option import accepts name, price, link and date without losing reviews or unknown shipping',()=>{const r=prepareOffers([row],[item],{itemId:item.id});assert.deepEqual(r.errors,[]);assert.equal(r.offers[0].itemId,item.id);assert.equal(r.offers[0].shipping,null);assert.equal(r.offers[0].rating,4.7);assert.equal(r.offers[0].reviewCount,210);assert.equal(r.offers[0].provider,'Site da loja');assert.equal(filterOffers(r.offers,{freeShipping:true}).length,0);});
test('identical imports are skipped while changes in price/date are retained',()=>{const first=prepareOffers([row],[item],{itemId:item.id});const repeat=prepareOffers([row,{...row,preco:'3500',data_consulta:'2026-10-25'}],[item],{itemId:item.id,existing:first.offers});assert.deepEqual(repeat.errors,[]);assert.equal(repeat.duplicates,1);assert.equal(repeat.offers.length,1);const all=[...first.offers,...repeat.offers];assert.equal(all.length,2);assert.equal(latestOffers(all).length,1);assert.equal(latestOffers(all)[0].price,3500);});
test('ambiguous checklist names require identity or room, and scoped imports reject another item',()=>{const other={...item,id:'f2',room:'Área externa'};const ambiguous=prepareOffers([{...row,item:'Geladeira'}],[item,other]);assert.ok(ambiguous.errors.some(e=>e.includes('mais de um')));const resolved=prepareOffers([{...row,item:'Geladeira',ambiente:'Cozinha'}],[item,other]);assert.deepEqual(resolved.errors,[]);assert.equal(resolved.offers[0].itemId,'f1');const mismatch=prepareOffers([{...row,item_id:'f2'}],[item,other],{itemId:'f1'});assert.ok(mismatch.errors.some(e=>e.includes('outro item')));});
test('dates, links and reviews are validated instead of silently invented',()=>{assert.equal(parseObservationDate('2026-02-30'),null);assert.equal(parseObservationDate('2026-10-24T09:00:00'),null);assert.equal(parseObservationDate('24/10/2026').date,'2026-10-24');assert.equal(parseObservationDate('2026-10-24T09:10:00-03:00').observedAt,'2026-10-24T12:10:00.000Z');const invalid=prepareOffers([{...row,data_consulta:'',link:'javascript:alert(1)',nota:6,avaliacoes:1.5}],[item],{itemId:'f1'});assert.equal(invalid.errors.length,4);});
test('CSV format round-trips dates, source links, accented names and quoted observations',()=>{const raw={...row,item_id:'f1',frete:'0',observacoes:'220 V; preço no Pix, verificar estoque'};const result=prepareOffers(parseCSV(csvString([raw],OFFER_FIELDS)),[item]);assert.deepEqual(result.errors,[]);assert.equal(result.offers[0].notes,raw.observacoes);assert.equal(result.offers[0].url,raw.link);assert.equal(result.offers[0].shipping,0);});
test('export and reimport preserve timestamps, reviews and unknown shipping',()=>{const first=prepareOffers([{...row,data_consulta:'2026-10-24T23:10:00-03:00'}],[item],{itemId:'f1'});const result=prepareOffers(parseCSV(csvString(offersToRows(first.offers,[item]),OFFER_FIELDS)),[item]);assert.deepEqual(result.errors,[]);assert.equal(result.offers[0].observedAt,'2026-10-25T02:10:00.000Z');assert.equal(result.offers[0].shipping,null);assert.equal(result.offers[0].reviewCount,210);const repeat=prepareOffers(parseCSV(csvString(offersToRows(first.offers,[item]),OFFER_FIELDS)),[item],{existing:first.offers});assert.equal(repeat.duplicates,1);});
test('same product link replaces the visible option even when title or campaign changes',()=>{
 const first=prepareOffers([row],[item],{itemId:'f1'}).offers;
 const next=prepareOffers([{...row,nome:'Novo título do produto',link:row.link+'?utm_source=chat&gclid=123#reviews',preco:3490,data_consulta:'2026-10-25'}],[item],{itemId:'f1',existing:first}).offers;
 const all=[...first,...next],{current,archived}=partitionOffers(all);
 assert.deepEqual(current,next);assert.deepEqual(archived,first);assert.equal(all.length,2);
 assert.deepEqual(summarizeOfferImport(first,next),{newOptions:0,updatedOptions:1,archivedCount:1,historicalImports:0});
});
test('same model and store retain link revisions without hiding other stores, variants or checklist items',()=>{
 const first=prepareOffers([row],[item],{itemId:'f1'}).offers;
 const changed={...first[0],id:'changed',model:'  MODELO A   400 L ',store:'LOJA A',url:'https://example.com/new-url',price:3300,date:'2026-10-25'};
 const otherStore={...changed,id:'store-b',store:'Loja B',url:'https://example.org/b'};
 const variant={...changed,id:'variant',model:'Modelo A 500 L',url:'https://example.com/new-url?sku=500'};
 const otherItem={...changed,id:'other-item',itemId:'f2'};
 const result=partitionOffers([...first,changed,otherStore,variant,otherItem]);
 assert.deepEqual(result.current,[changed,otherStore,variant,otherItem]);assert.deepEqual(result.archived,first);
});
test('older imported dates go straight to history and ties use the last imported row',()=>{
 const first=prepareOffers([{...row,data_consulta:'2026-10-25',preco:3500}],[item],{itemId:'f1'}).offers;
 const older=prepareOffers([{...row,data_consulta:'2026-10-23'}],[item],{itemId:'f1',existing:first}).offers;
 assert.deepEqual(partitionOffers([...first,...older]),{current:first,archived:older});
 assert.deepEqual(summarizeOfferImport(first,older),{newOptions:0,updatedOptions:0,archivedCount:0,historicalImports:1});
 const tie={...first[0],id:'tie',price:3200};assert.deepEqual(latestOffers([...first,...older,tie]),[tie]);
});
test('all revisions from a single file are preserved while only the latest is current',()=>{
 const imported=prepareOffers([row,{...row,data_consulta:'2026-10-25',preco:3400},{...row,nome:'Modelo B',link:'https://example.com/b',preco:3800}],[item],{itemId:'f1'}).offers;
 assert.equal(latestOffers(imported).length,2);assert.equal(partitionOffers(imported).archived.length,1);
 assert.deepEqual(summarizeOfferImport([],imported),{newOptions:2,updatedOptions:0,archivedCount:0,historicalImports:1});
 const reimported=prepareOffers(parseCSV(csvString(offersToRows(imported,[item]),OFFER_FIELDS)),[item]);
 assert.equal(reimported.offers.length,3);assert.equal(partitionOffers(reimported.offers).archived.length,1);
});
