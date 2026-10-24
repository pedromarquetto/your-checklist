'use client';
import React,{useState} from 'react';
import {safeImageUrl} from '../lib/core.mjs';

export default function OfferImage({src,name,compact=false}){
 const url=safeImageUrl(src),[failedUrl,setFailedUrl]=useState('');
 return <div className={'qc-offer-image'+(compact?' is-compact':'')}>
  {url&&failedUrl!==url?<img src={url} alt={name||'Foto do produto'} width="160" height="180" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={()=>setFailedUrl(url)}/>:<span className="qc-image-placeholder" role="img" aria-label={`Imagem não disponível para ${name||'este produto'}`}><span aria-hidden="true">▧</span><small>Sem imagem</small></span>}
 </div>;
}
