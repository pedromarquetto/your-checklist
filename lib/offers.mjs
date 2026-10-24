import {numeric,safeUrl,normalize} from './core.mjs';

export const totalPrice=offer=>Number.isFinite(offer.shipping)?offer.price+offer.shipping:null;
export const offerTimestamp=offer=>Date.parse(offer.observedAt||`${offer.date}T00:00:00Z`)||0;
const identityText=value=>normalize(value).replace(/\s+/g,' ');
function productUrl(value){
 const safe=safeUrl(value);if(!safe)return '';
 const url=new URL(safe);
 // Ignore campaign metadata, but retain SKU/variant parameters and SPA routes.
 for(const key of [...url.searchParams.keys()])if(/^(utm_|gclid$|dclid$|fbclid$|msclkid$|gbraid$|wbraid$|mc_cid$|mc_eid$|_ga$|_gl$)/i.test(key))url.searchParams.delete(key);
 url.searchParams.sort();
 if(!/^#(?:\/|!)/.test(url.hash))url.hash='';
 return url.href;
}
function groupOffers(records){
 const parents=records.map((_,index)=>index),aliases=new Map();
 const root=index=>{while(parents[index]!==index){parents[index]=parents[parents[index]];index=parents[index];}return index;};
 records.forEach((offer,index)=>{
  const url=productUrl(offer.url),model=identityText(offer.model),store=identityText(offer.store),keys=[];
  if(url)keys.push(JSON.stringify([offer.itemId,'url',url]));
  if(model&&store&&store!=='loja nao informada')keys.push(JSON.stringify([offer.itemId,'model-store',model,store]));
  for(const key of keys){if(aliases.has(key))parents[root(index)]=root(aliases.get(key));else aliases.set(key,index);}
 });
 const groups=new Map();
 records.forEach((offer,index)=>{const key=root(index);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(offer);});
 return [...groups.values()];
}
export function partitionOffers(records){
 const current=[],archived=[];
 for(const group of groupOffers(records)){
  // Observation date wins; the last imported row breaks ties on the same date.
  const latest=group.reduce((a,b)=>offerTimestamp(b)>=offerTimestamp(a)?b:a);
  current.push(latest);archived.push(...group.filter(offer=>offer!==latest));
 }
 return {current,archived};
}
export const latestOffers=records=>partitionOffers(records).current;
export function summarizeOfferImport(existing,incoming){
 const existingSet=new Set(existing),incomingSet=new Set(incoming);
 let newOptions=0,updatedOptions=0,historicalImports=0;
 const combined=[...existing,...incoming],{current}=partitionOffers(combined),currentSet=new Set(current);
 for(const group of groupOffers(combined)){
  if(!group.some(offer=>incomingSet.has(offer)))continue;
  if(!group.some(offer=>existingSet.has(offer)))newOptions++;
  else if(group.some(offer=>incomingSet.has(offer)&&currentSet.has(offer)))updatedOptions++;
 }
 for(const offer of incoming)if(!currentSet.has(offer))historicalImports++;
 const archivedCount=latestOffers(existing).filter(offer=>!currentSet.has(offer)).length;
 return {newOptions,updatedOptions,archivedCount,historicalImports};
}
export function filterOffers(offers,{minPrice='',maxPrice='',minRating=0,minReviews=0,freeShipping=false,withinBudget=false,budget=Infinity,sort='price'}={}){
 const min=minPrice===''?0:Number(minPrice),max=maxPrice===''?Infinity:Number(maxPrice);
 const filtered=offers.filter(o=>o.price>=min&&o.price<=max&&(!minRating||(Number.isFinite(o.rating)&&o.rating>=Number(minRating)))&&(!minReviews||(Number.isFinite(o.reviewCount)&&o.reviewCount>=Number(minReviews)))&&(!freeShipping||o.shipping===0)&&(!withinBudget||(totalPrice(o)!==null&&totalPrice(o)<=budget)));
 const cost=o=>totalPrice(o)??Infinity;
 return filtered.sort((a,b)=>sort==='rating'?(b.rating??-1)-(a.rating??-1)||(b.reviewCount??0)-(a.reviewCount??0):sort==='reviews'?(b.reviewCount??-1)-(a.reviewCount??-1):sort==='expensive'?b.price-a.price:cost(a)-cost(b)||a.price-b.price);
}
export function normalizeShoppingResults(payload,itemId,observedAt=new Date().toISOString()){
 return (Array.isArray(payload.shopping_results)?payload.shopping_results:[]).flatMap((r,index)=>{
  const price=numeric(r.extracted_price,NaN);
  // Monthly installment ads are not comparable with a full purchase price.
  if(!Number.isFinite(price)||price<=0||r.installment||/\/\s*(mo|m[eê]s)|por m[eê]s/i.test(r.price||'')||/^(US\$|USD|EUR|€|\$|£|GBP)/i.test(String(r.price||'').trim()))return [];
  const delivery=String(r.delivery||'');let shipping=null;
  if(/^(frete gr[aá]tis|entrega gr[aá]tis|free (delivery|shipping))\s*[.!]?$/i.test(delivery.trim()))shipping=0;
  else {const amount=delivery.match(/R\$\s*([\d.,]+)/);if(amount){const parsed=numeric(amount[1],NaN);if(Number.isFinite(parsed)&&parsed>=0)shipping=parsed;}}
  const rating=typeof r.rating==='number'&&r.rating>=0&&r.rating<=5?r.rating:null;
  const reviewCount=typeof r.reviews==='number'&&Number.isInteger(r.reviews)&&r.reviews>=0?r.reviews:null;
  return [{id:`web-${r.product_id||index}-${itemId}`,itemId,store:String(r.source||'Loja não informada'),model:String(r.title||'Produto'),price,shipping,rating,reviewCount,delivery:delivery||'Frete e prazo a confirmar na loja',date:observedAt.slice(0,10),observedAt,url:safeUrl(r.product_link||r.link||''),source:'live',provider:'Google Shopping via SerpApi'}];
 });
}
