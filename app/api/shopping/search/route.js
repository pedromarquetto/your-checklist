import {normalizeShoppingResults} from '../../../../lib/offers.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const response=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request){
 // Disabled by default: authentication and durable per-user quotas belong to
 // the production phase. Enabling alone is intended for private/local review.
 if(process.env.SHOPPING_SEARCH_ENABLED!=='true'||!process.env.SERPAPI_API_KEY)return response({code:'NOT_CONFIGURED',message:'A busca ao vivo ainda não está conectada. As ofertas de exemplo estão disponíveis para testar os filtros.'},503);
 const origin=request.headers.get('origin');
 if(origin&&origin!==new URL(request.url).origin)return response({message:'Origem não permitida.'},403);
 let body;try{body=await request.json();}catch{return response({message:'Envie uma consulta válida.'},400);}
 const query=typeof body.query==='string'?body.query.trim():'';
 const itemId=typeof body.itemId==='string'?body.itemId.slice(0,100):'';
 if(query.length<3||query.length>200||!itemId)return response({message:'Informe um item e uma busca de 3 a 200 caracteres.'},400);
 const params=new URLSearchParams({engine:'google_shopping',q:query,gl:'br',hl:'pt',google_domain:'google.com.br',no_cache:'true',api_key:process.env.SERPAPI_API_KEY});
 try{
  const upstream=await fetch(`https://serpapi.com/search.json?${params}`,{cache:'no-store',signal:AbortSignal.timeout(18000)});
  if(!upstream.ok)return response({message:upstream.status===429?'A fonte de ofertas atingiu seu limite. Tente novamente mais tarde.':'A fonte de ofertas não respondeu à consulta.'},502);
  const payload=await upstream.json();
  if(payload.error)return response({message:'A fonte não conseguiu concluir esta pesquisa. Tente uma descrição mais específica.'},502);
  const observedAt=new Date().toISOString();
  return response({offers:normalizeShoppingResults(payload,itemId,observedAt),observedAt,query,source:'Google Shopping via SerpApi'});
 }catch(error){return response({message:error.name==='TimeoutError'?'A pesquisa demorou mais que o esperado. Tente novamente.':'Não foi possível consultar a fonte de ofertas agora.'},502);}
}
