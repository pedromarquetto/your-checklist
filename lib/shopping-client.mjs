export const isInlinePreview=false;
export async function searchOffers(query,itemId,signal){
 const response=await fetch('/api/shopping/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query,itemId}),signal});
 const payload=await response.json();
 if(!response.ok)throw new Error(payload.message||'Não foi possível consultar as ofertas.');
 return payload;
}

export async function researchOffers(query,itemId,signal){
 const response=await fetch('/api/shopping/research',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query,itemId}),signal});
 const payload=await response.json();
 if(!response.ok)throw new Error(payload.message||'Não foi possível pesquisar preços e pontos.');
 return payload;
}
