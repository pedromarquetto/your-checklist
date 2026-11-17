import { PAYMENT_FIELDS, normalizePayment, paymentErrors } from './payments.mjs';
export const STATUSES = ['Planejado', 'Pesquisando', 'Comprado', 'Recebido', 'Concluído'];
export const METHODS = ['Pix', 'Cartão de crédito', 'Cartão de débito', 'Boleto', 'Dinheiro'];
export const FIELDS = [
 ['id','ID',false], ['ambiente','Ambiente',true], ['categoria','Categoria',true], ['item','Item',true], ['item_pai','ID do item pai',false],
 ['quantidade','Quantidade',false], ['valor_previsto_unitario','Valor previsto unitário',false], ['status','Status',false], ['prioridade','Prioridade',false],
 ['valor_pago_total','Valor pago total',false], ['forma_pagamento','Forma de pagamento',false], ['parcelas','Parcelas',false], ['data_compra','Data da compra',false],
 ['loja','Loja',false], ['link','Link',false], ['observacoes','Observações',false]
];
export const OFFER_COLUMNS = [
 ['item_id','ID do item',false,['id_item','itemId']],['item','Item do checklist',false,['item_checklist']],
 ['ambiente','Ambiente',false,['room']],['categoria','Categoria',false,['category']],
 ['nome','Nome do produto / modelo',true,['modelo','produto','nome_produto','title','model']],
 ['loja','Loja',false,['store','seller']],['preco','Preço unitário',true,['price','valor']],
 ['frete','Frete',false,['shipping']],['moeda','Moeda',false,['currency']],
 ['data_consulta','Data da consulta',true,['data','date','observed_at']],
 ['link','Link da oferta',true,['url','product_url']],['nota','Nota de 0 a 5',false,['rating']],
 ['avaliacoes','Quantidade de avaliações',false,['reviews','review_count','reviewCount']],
 ['prazo_entrega','Prazo de entrega',false,['delivery']],['fonte','Fonte da pesquisa',false,['source','provider']],
 ['observacoes','Observações',false,['notes']],
 ['imagem_url','Link da imagem',false,['imagem','image','image_url','imageUrl','thumbnail','foto','foto_url']],
 ...PAYMENT_FIELDS.map(([key,label,,column])=>[column,label,false,[key]])
];
export const OFFER_FIELDS = OFFER_COLUMNS.map(([key])=>key);
export const uid = () => globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const money = value => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:2}).format(Number(value)||0);
export const normalize = value => String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
export const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function numeric(value, fallback = 0) {
 if (value===undefined || value===null || String(value).trim()==='') return fallback;
 if (typeof value==='number') return Number.isFinite(value) ? value : NaN;
 let str=String(value).trim().replace(/R\$|\s/g,'');
 if(str.includes(',')&&str.includes('.')) str=str.lastIndexOf(',')>str.lastIndexOf('.')?str.replace(/\./g,'').replace(',','.'):str.replace(/,/g,'');
 else if(str.includes(',')) str=str.replace(',','.');
 return /^-?\d+(\.\d+)?$/.test(str)?Number(str):NaN;
}
export function parseCSV(text) {
 text=String(text).replace(/^\uFEFF/,'');
 const line=text.split(/\r?\n/)[0]||'';
 let quoted=false, commas=0, semis=0;
 for(let i=0;i<line.length;i++){if(line[i]==='"')quoted=!quoted;else if(!quoted&&line[i]===',')commas++;else if(!quoted&&line[i]===';')semis++;}
 const delim=semis>commas?';':','; const rows=[];let row=[],cell='',inside=false;
 for(let i=0;i<text.length;i++){const ch=text[i]; if(ch==='"'){if(inside&&text[i+1]==='"'){cell+='"';i++;}else inside=!inside;}
 else if(ch===delim&&!inside){row.push(cell);cell='';}else if((ch==='\n'||ch==='\r')&&!inside){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';}else cell+=ch;}
 if(inside) throw new Error('Há aspas sem fechamento no CSV.');
 row.push(cell);if(row.some(x=>x.trim()))rows.push(row);
 if(!rows.length)return [];
 const headers=rows[0].map(x=>x.trim());
 if(new Set(headers).size!==headers.length)throw new Error('A planilha possui cabeçalhos duplicados.');
 return rows.slice(1).map(values=>Object.fromEntries(headers.map((h,i)=>[h,values[i]||''])));
}
export function safeUrl(value){try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)?url.href:'';}catch{return '';}}
export function safeImageUrl(value){try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';}catch{return '';}}
export function leafItems(items){return items.filter(i=>!items.some(c=>c.parentId===i.id));}
export function itemCost(item,items,actual=false){const children=items.filter(c=>c.parentId===item.id);if(children.length)return children.reduce((sum,c)=>sum+itemCost(c,items,actual),0);return actual?(item.paidTotal||0):item.qty*item.unitBudget;}
export function totals(items){const leaves=leafItems(items);return {count:leaves.length,bought:leaves.filter(i=>['Comprado','Recebido','Concluído'].includes(i.status)).length,planned:leaves.reduce((s,i)=>s+i.qty*i.unitBudget,0),paid:leaves.reduce((s,i)=>s+(i.paidTotal||0),0)};}
export function prepareImport(rows,mapping,existing=[],{simple=false}={}){
 const errors=[],items=[];const ids=new Map();
 rows.forEach((row,index)=>{const get=key=>String(row[mapping[key]]??'').trim();const rowNo=index+2;
 const name=get('item'),room=get('ambiente'),category=get('categoria');
 if(!name||!room||!category)errors.push(`Linha ${rowNo}: item, ambiente e categoria são obrigatórios.`);
 const qty=numeric(get('quantidade'),1),unitBudget=numeric(get('valor_previsto_unitario')),paidTotal=numeric(get('valor_pago_total')),installments=numeric(get('parcelas'),1);
 if(!Number.isFinite(qty)||qty<=0||!Number.isInteger(qty))errors.push(`Linha ${rowNo}: quantidade precisa ser um inteiro positivo.`);
 if(!Number.isFinite(unitBudget)||unitBudget<0||!Number.isFinite(paidTotal)||paidTotal<0)errors.push(`Linha ${rowNo}: preço inválido.`);
 if(!Number.isInteger(installments)||installments<1||installments>120)errors.push(`Linha ${rowNo}: parcelas precisam estar entre 1 e 120.`);
 const status=get('status')||'Planejado';if(!STATUSES.includes(status))errors.push(`Linha ${rowNo}: status inválido (${status}).`);
 const priority=get('prioridade')||'Média';if(!['Alta','Média','Baixa'].includes(priority))errors.push(`Linha ${rowNo}: prioridade inválida.`);
 const method=get('forma_pagamento');if(method&&!METHODS.includes(method))errors.push(`Linha ${rowNo}: forma de pagamento inválida.`);
 const date=get('data_compra');if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date))errors.push(`Linha ${rowNo}: use uma data válida no formato AAAA-MM-DD.`);
 if(!simple&&['Comprado','Recebido'].includes(status)&&(!date||!method||!get('valor_pago_total')))errors.push(`Linha ${rowNo}: itens comprados exigem valor pago, data e forma de pagamento.`);
 const link=get('link');if(link&&!safeUrl(link))errors.push(`Linha ${rowNo}: link deve começar com http:// ou https://.`);
 const externalId=get('id')||`row-${rowNo}`;if(ids.has(externalId))errors.push(`Linha ${rowNo}: ID duplicado (${externalId}).`);
 const id=uid();ids.set(externalId,id);items.push({id,name,room,category,qty,unitBudget,status,priority,paidTotal,paymentMethod:method,installments,purchaseDate:date,store:get('loja'),url:safeUrl(link),notes:get('observacoes'),parentId:null,_parent:get('item_pai'),_external:externalId,_line:rowNo});
 });
 items.forEach(i=>{if(i._parent){i.parentId=ids.get(i._parent)||null;if(!i.parentId)errors.push(`Linha ${i._line}: ID do item pai não encontrado.`);else {const parent=items.find(p=>p.id===i.parentId);if(parent?.room!==i.room||parent?.category!==i.category)errors.push(`Linha ${i._line}: subitem deve ter o mesmo ambiente e categoria do pai.`);}}});
 items.forEach(i=>{let current=i;const visited=new Set();while(current){if(visited.has(current.id)){errors.push(`Linha ${i._line}: hierarquia circular de subitens.`);break;}visited.add(current.id);current=items.find(x=>x.id===current.parentId);}});
 const key=i=>[i.room,i.category,i.name].map(normalize).join('|');let duplicates=0;const seen=new Set(existing.map(key));
 const accepted=items.filter(i=>{if(seen.has(key(i))){duplicates++;return false;}seen.add(key(i));return true;});
 const validIds=new Set(accepted.map(i=>i.id));accepted.forEach(i=>{if(i.parentId&&!validIds.has(i.parentId))errors.push(`Linha ${i._line}: o pai foi ignorado como duplicado. Importe a hierarquia com nomes únicos.`);});
 return {items:accepted.map(({_parent,_external,_line,...i})=>i),errors:[...new Set(errors)],duplicates};
}
export function mapOfferColumns(headers){const key=value=>normalize(value).replace(/[^a-z0-9]/g,'');return Object.fromEntries(OFFER_COLUMNS.map(([id,label,,aliases])=>[id,headers.find(h=>[id,label,...aliases].some(alias=>key(h)===key(alias)))||'']));}
export function offerFingerprint(o){return JSON.stringify([o.itemId,o.model,o.store,o.url,o.observedAt||o.date,o.price,o.shipping??null,o.rating??null,o.reviewCount??null,o.delivery||'',o.provider||'',o.notes||'',o.currency||'BRL',o.imageUrl||'',normalizePayment(o.payment)]);}
export function parseObservationDate(raw){
 let value=String(raw||'').trim();if(/^\d{2}\/\d{2}\/\d{4}$/.test(value)){const [d,m,y]=value.split('/');value=`${y}-${m}-${d}`;}
 const day=value.slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return null;
 const check=new Date(day+'T00:00:00Z');if(isNaN(check.getTime())||check.toISOString().slice(0,10)!==day)return null;
 if(value.length===10)return {date:day,observedAt:null};
 if(!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value))return null;
 const stamp=new Date(value);return isNaN(stamp.getTime())?null:{date:day,observedAt:stamp.toISOString()};
}
export function prepareOffers(rows,items,{mapping,itemId=null,existing=[]}={}){
 const errors=[],offers=[];let duplicates=0;const seen=new Set(existing.map(offerFingerprint));
 const auto=mapOfferColumns(Object.keys(rows[0]||{}));
 rows.forEach((row,index)=>{const line=index+2;const get=key=>String(row[mapping&&Object.prototype.hasOwnProperty.call(mapping,key)?mapping[key]:auto[key]]??'').trim();
  const externalId=get('item_id'),name=get('item');let target;
  if(itemId){target=items.find(i=>i.id===itemId);if(externalId&&externalId!==itemId)errors.push(`Linha ${line}: ID pertence a outro item; a importação está vinculada ao item selecionado.`);if(!externalId&&name&&normalize(name)!==normalize(target?.name))errors.push(`Linha ${line}: o nome do item não corresponde ao item selecionado.`);}
  else if(externalId)target=items.find(i=>i.id===externalId);
  else{const candidates=items.filter(i=>normalize(i.name)===normalize(name)&&(!get('ambiente')||normalize(i.room)===normalize(get('ambiente')))&&(!get('categoria')||normalize(i.category)===normalize(get('categoria'))));if(candidates.length>1)errors.push(`Linha ${line}: há mais de um item com esse nome. Informe item_id ou ambiente/categoria.`);else target=candidates[0];}
  if(!target)errors.push(`Linha ${line}: item não encontrado neste projeto.`);
  if(target&&get('ambiente')&&normalize(target.room)!==normalize(get('ambiente')))errors.push(`Linha ${line}: ambiente não corresponde ao item.`);
  if(target&&get('categoria')&&normalize(target.category)!==normalize(get('categoria')))errors.push(`Linha ${line}: categoria não corresponde ao item.`);
  const price=numeric(get('preco'),NaN),shipping=get('frete')===''?null:numeric(get('frete'),NaN),rating=get('nota')===''?null:numeric(get('nota'),NaN),reviewCount=get('avaliacoes')===''?null:numeric(get('avaliacoes'),NaN);
  if(!Number.isFinite(price)||price<=0)errors.push(`Linha ${line}: preço deve ser um número positivo.`);
  if(shipping!==null&&(!Number.isFinite(shipping)||shipping<0))errors.push(`Linha ${line}: frete inválido; deixe vazio se não souber ou use 0 para grátis.`);
  if(rating!==null&&(!Number.isFinite(rating)||rating<0||rating>5))errors.push(`Linha ${line}: nota precisa estar entre 0 e 5.`);
  if(reviewCount!==null&&(!Number.isInteger(reviewCount)||reviewCount<0))errors.push(`Linha ${line}: quantidade de avaliações deve ser um inteiro não negativo.`);
  const observation=parseObservationDate(get('data_consulta'));if(!observation)errors.push(`Linha ${line}: informe uma data real em AAAA-MM-DD, DD/MM/AAAA ou data/hora ISO com fuso.`);
  const url=safeUrl(get('link'));if(!url)errors.push(`Linha ${line}: informe um link http:// ou https:// válido.`);
  const imageUrl=safeImageUrl(get('imagem_url'));if(get('imagem_url')&&!imageUrl)errors.push(`Linha ${line}: imagem_url deve ser um link HTTPS válido, sem usuário ou senha. Deixe vazio se não houver foto.`);
  const currency=(get('moeda')||'BRL').toUpperCase();if(currency!=='BRL')errors.push(`Linha ${line}: esta versão compara preços em BRL. Converta outras moedas antes de importar.`);
  const model=get('nome')||target?.name||'';if(!model)errors.push(`Linha ${line}: informe o nome do produto.`);
  const payment=normalizePayment(Object.fromEntries(PAYMENT_FIELDS.map(([key,,type,column,options])=>{const raw=get(column);return [key,raw===''?undefined:['number','amount','integer'].includes(type)?numeric(raw,NaN):type==='boolean'?/^(sim|true|1)$/i.test(raw)?true:/^(nao|não|false|0)$/i.test(raw)?false:raw:type==='enum'?options.find(v=>normalize(v)===normalize(raw))??raw:raw];})));
  errors.push(...paymentErrors(payment,{price,shipping}).map(e=>`Linha ${line}: ${e}`));
  const offer={id:uid(),payment,itemId:target?.id,store:get('loja')||'Loja não informada',model,price,shipping,rating,reviewCount,date:observation?.date||'',observedAt:observation?.observedAt||null,url,imageUrl,currency,delivery:get('prazo_entrega'),provider:get('fonte'),notes:get('observacoes'),source:'imported'};
  const key=offerFingerprint(offer);if(seen.has(key)){duplicates++;return;}seen.add(key);offers.push(offer);
 });return {offers,errors:[...new Set(errors)],duplicates};
}
export function offerResearchPrompt(item){return `Pesquise opções reais de compra no Brasil para este item do meu checklist:
Item: ${item.name}
ID do item: ${item.id}
Ambiente: ${item.room}
Categoria: ${item.category}
Quantidade desejada: ${item.qty}
Orçamento unitário: ${item.unitBudget?money(item.unitBudget):'Não definido'}
Especificações e medidas: ${item.notes||'Não informadas; confirme os requisitos antes de restringir a busca.'}

Retorne CSV UTF-8 com ponto e vírgula, cabeçalhos exatos:
${OFFER_FIELDS.join(';')}

Use o item_id acima. Uma linha por produto, loja, forma de pagamento, parcelas, cartão, programa parceiro e condição de clube. Pix e cartão devem ser linhas separadas, mesmo com o mesmo link. preco é o preço unitário TOTAL nessa forma de pagamento, com juros e desconto já aplicados: nunca a parcela mensal. frete, taxas e custo_clube são valores por unidade; não repita juros já incluídos no preco. Não desconte pontos do preco. data_consulta é a data real da verificação (AAAA-MM-DD ou ISO com fuso); moeda=BRL; link é a página real do produto; imagem_url é a foto HTTPS desse anúncio, ou vazio se desconhecida. nota=0 a 5; avaliacoes=inteiro.

Pesquise também parceria da loja com Livelo, Esfera, Smiles, LATAM Pass, TudoAzul ou outros programas, nas fontes oficiais atuais. Registre programa_parceiro, pontos_parceiro_taxa (pontos por R$ 1), base_parceiro (valor elegível do produto, excluindo frete/taxas e demais exclusões do regulamento), fonte_parceiro, verificado_parceiro, validade_parceiro e condicoes_pontos. Confira produto, categoria, vendedor, canal/link de entrada do parceiro, CPF, prazo, cupom, itens no carrinho e data de crédito. elegibilidade_parceiro=eligible somente quando todas as condições forem confirmadas; senão unknown ou ineligible. exige_clube e assinante_clube usam sim/nao; não presuma assinatura: traga a taxa de não assinante e, se útil, outra linha para a taxa do clube. Inclua custo_clube se houver custo adicional para aderir, rateado por unidade, ou deixe a elegibilidade pendente até confirmar o custo.

Pontos do cartão: identifique cartao e programa_cartao; pontos_cartao_taxa exige regra verificada do cartão específico; pontos_cartao_unidade=BRL ou USD. Para USD, cotacao_dolar é a taxa realmente usada pelo emissor. Informe base_cartao, fonte_cartao e verificado_cartao. Não presuma taxa, cartão, câmbio ou transferência bonificada. acumulo_conjunto=yes somente se a soma de cartão e parceiro estiver confirmada; no se excludentes; unknown se incerto. valor_mil_cartao e valor_mil_parceiro são a avaliação pessoal do usuário em R$ por 1.000 pontos: deixe vazios para ele definir, sem atribuir valor de dinheiro automaticamente.

Datas de regras usam AAAA-MM-DD. Campos desconhecidos ficam vazios; frete=0 só quando confirmado. Não invente preços, reviews, parcerias, pontos ou validade. Confirme preços, links e regulamentos pela web. Não inclua produto sem preço/link verificável. Não efetue compras nem acesse contas de banco ou programas.`;}
export function offersToRows(records,items){return records.map(o=>{const item=items.find(i=>i.id===o.itemId);return {item_id:o.itemId,item:item?.name||'',ambiente:item?.room||'',categoria:item?.category||'',nome:o.model,loja:o.store,preco:o.price,frete:o.shipping??'',moeda:o.currency||'BRL',data_consulta:o.observedAt||o.date,link:o.url,nota:o.rating??'',avaliacoes:o.reviewCount??'',prazo_entrega:o.delivery||'',fonte:o.provider||'',observacoes:o.notes||'',imagem_url:o.imageUrl||'',...Object.fromEntries(PAYMENT_FIELDS.map(([key,,type,column])=>[column,type==='boolean'?(normalizePayment(o.payment)[key]?'sim':'nao'):normalizePayment(o.payment)[key]??'']))};});}
export function csvCell(value){let s=String(value??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
export function csvString(rows,headers){return '\uFEFF'+[headers,...rows.map(r=>headers.map(h=>r[h]??''))].map(r=>r.map(csvCell).join(';')).join('\r\n');}
