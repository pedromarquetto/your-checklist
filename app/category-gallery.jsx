'use client';
import React,{useEffect,useRef,useState} from 'react';
import {uid,normalize,safeImageUrl} from '../lib/core.mjs';
import {MAX_CATEGORY_PHOTOS,loadCategoryGalleries,changeCategoryGallery} from '../lib/category-gallery.mjs';
import {prepareReferenceUpload,readReferenceImage} from '../lib/reference-images.mjs';

export function useCategoryGalleries(projectId){
 const [state,setState]=useState({projectId:null,records:[],ready:false,error:''}),[retry,setRetry]=useState(0);
 useEffect(()=>{
  let active=true;setState({projectId,records:[],ready:false,error:''});
  loadCategoryGalleries(projectId).then(records=>{if(active)setState({projectId,records,ready:true,error:''});}).catch(()=>{if(active)setState({projectId,records:[],ready:true,error:'Não foi possível acessar as referências salvas neste navegador. Verifique as permissões de armazenamento e tente novamente.'});});
  return()=>{active=false;};
 },[projectId,retry]);
 const records=state.projectId===projectId?state.records:[];
 async function change(category,action){
  const record=await changeCategoryGallery(projectId,category,action);
  setState(current=>current.projectId===projectId?{...current,error:'',records:[...current.records.filter(gallery=>gallery.key!==record.key),record]}:current);
  return record;
 }
 return {records,ready:state.projectId===projectId&&state.ready,error:state.projectId===projectId?state.error:'',change,reload:()=>setRetry(value=>value+1)};
}

function ReferenceImage({photo}){
 const [failed,setFailed]=useState(false);
 return failed?<span className="qc-reference-unavailable">Imagem indisponível</span>:<img src={photo.src} alt={photo.caption||'Referência da categoria'} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>;
}
export function CategoryReferenceStrip({photos,onOpen}){
 if(!photos.length)return null;
 return <div className="qc-reference-strip"><span>Referências</span>{photos.slice(0,3).map((photo,index)=><button type="button" key={photo.id} onClick={onOpen} aria-label={`Abrir referência ${index+1} da categoria`}><ReferenceImage photo={photo}/></button>)}<button type="button" className="qc-text-button" onClick={onOpen}>Ver galeria{photos.length>3?` (+${photos.length-3})`:''} ↗</button></div>;
}

export default function CategoryGallery({category,categories,record,ready,storageError,onRetry,onCategoryChange,onChange,onAddItem}){
 const photos=record?.photos||[],input=useRef(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[newCategory,setNewCategory]=useState(false),[viewingId,setViewingId]=useState(null),[removeId,setRemoveId]=useState(null),[dragging,setDragging]=useState(false);
 const index=photos.findIndex(photo=>photo.id===viewingId),active=photos[index];
 async function run(action,success){
  setError('');setNotice('');setBusy(true);
  try{const result=await onChange(category,action);setNotice(typeof success==='function'?success(result):success||'Referências salvas.');return result;}
  catch(err){setError(err.name==='QuotaExceededError'?'O armazenamento deste navegador está cheio. Remova algumas referências antes de adicionar outras.':err.message||'Não foi possível salvar as referências.');return null;}
  finally{setBusy(false);}
 }
 async function upload(files){
  if(!category||busy||storageError)return;
  const selected=Array.from(files||[]);if(!selected.length)return;
  setError('');setNotice('');setBusy(true);
  try{
   if(selected.length>MAX_CATEGORY_PHOTOS)throw new Error(`Envie até ${MAX_CATEGORY_PHOTOS} imagens de cada vez.`);
   const prepared=[];
   for(const file of selected){const image=await prepareReferenceUpload(file);prepared.push({id:uid(),...image,caption:file.name.replace(/\.[^.]+$/,''),createdAt:new Date().toISOString()});}
   const result=await onChange(category,{type:'add',photos:prepared}),added=result.photos.length-photos.length;
   setNotice(added?`${added} ${added===1?'imagem adicionada':'imagens adicionadas'} à categoria.`:'Essas imagens já estão na galeria.');
  }catch(err){setError(err.name==='QuotaExceededError'?'O armazenamento deste navegador está cheio.':err.message||'Não foi possível preparar as imagens.');}
  finally{setBusy(false);if(input.current)input.current.value='';}
 }
 async function addLink(event){
  event.preventDefault();if(busy)return;
  const form=event.currentTarget,fields=new FormData(form),src=safeImageUrl(fields.get('url'));
  if(!src){setError('Informe o link HTTPS direto da imagem.');return;}
  setBusy(true);setError('');setNotice('');
  try{
   const image=await readReferenceImage(src);
   const result=await onChange(category,{type:'add',photos:[{id:uid(),src,caption:String(fields.get('caption')||'').trim(),createdAt:new Date().toISOString(),width:image.naturalWidth,height:image.naturalHeight}]});
   setNotice(result.photos.length>photos.length?'Referência adicionada.':'Essa imagem já está na galeria.');form.reset();
  }catch(err){setError(err.message||'Não foi possível adicionar esse link.');}finally{setBusy(false);}
 }
 return <div className="qc-category-gallery" onKeyDown={event=>{
  if(active&&event.key==='Escape'){event.stopPropagation();setViewingId(null);return;}
  if(!active||/INPUT|TEXTAREA|SELECT/.test(event.target.tagName))return;
  if(event.key==='ArrowLeft'&&index>0){event.preventDefault();setViewingId(photos[index-1].id);}
  if(event.key==='ArrowRight'&&index<photos.length-1){event.preventDefault();setViewingId(photos[index+1].id);}
 }}>
  <div className="qc-gallery-category"><label className="qc-field"><span>Categoria da galeria</span><select aria-label="Categoria da galeria" value={category} disabled={busy} onChange={event=>{setViewingId(null);setRemoveId(null);setError('');setNotice('');onCategoryChange(event.target.value);}}><option value="" disabled>Selecione uma categoria</option>{categories.map(name=><option key={name}>{name}</option>)}</select></label><button className="qc-button" type="button" disabled={busy||!ready||!!storageError} onClick={()=>setNewCategory(value=>!value)}>＋ Nova categoria</button></div>
  {newCategory&&<form className="qc-gallery-new-category" onSubmit={async event=>{event.preventDefault();const name=String(new FormData(event.currentTarget).get('category')||'').trim();if(!name)return;setBusy(true);setError('');try{const result=await onChange(name,{type:'create'});setNewCategory(false);setViewingId(null);onCategoryChange(result.category);}catch(err){setError(err.message);}finally{setBusy(false);}}}><label className="qc-field"><span>Nome da nova categoria</span><input name="category" aria-label="Nome da nova categoria" maxLength={80} required placeholder="Ex.: Cozinha planejada"/></label><button type="submit" className="qc-button qc-primary" disabled={busy}>Criar categoria</button></form>}
  <p className="qc-gallery-description">Guarde fotos do projeto, plantas e inspirações para consultar enquanto monta sua lista.</p>
  <p className="qc-gallery-storage">Imagens salvas neste navegador. Cada categoria tem sua própria galeria dentro deste checklist.</p>
  {storageError&&<div className="qc-error" role="alert"><p>{storageError}</p><button className="qc-button" onClick={onRetry}>Tentar novamente</button></div>}
  {!ready&&<p role="status">Carregando referências…</p>}
  {error&&<p className="qc-error" role="alert">{error}</p>}
  {notice&&<p className="qc-success" role="status">{notice}</p>}
  {active?<section className="qc-reference-viewer" aria-label="Referência ampliada"><button type="button" className="qc-text-button" autoFocus onClick={()=>setViewingId(null)}>← Voltar à galeria</button><div className="qc-reference-large"><ReferenceImage key={active.id} photo={active}/></div><p>{active.caption||'Sem legenda'}</p><div className="qc-reference-navigation"><button className="qc-button" type="button" disabled={index<=0} onClick={()=>setViewingId(photos[index-1].id)}>← Anterior</button><span aria-live="polite">{index+1} de {photos.length}</span><button className="qc-button" type="button" disabled={index>=photos.length-1} onClick={()=>setViewingId(photos[index+1].id)}>Próxima →</button></div></section>:<>
   <div className={'qc-reference-upload'+(dragging?' is-dragging':'')} onDragOver={event=>{event.preventDefault();if(!busy)setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={event=>{event.preventDefault();setDragging(false);if(ready&&!storageError)upload(event.dataTransfer.files);}}>
    <strong>{busy?'Salvando referências…':'Traga suas referências para esta categoria'}</strong><p>Arraste as imagens aqui ou selecione vários arquivos.</p><button type="button" className="qc-button qc-primary" disabled={!category||busy||!ready||!!storageError||photos.length>=MAX_CATEGORY_PHOTOS} onClick={()=>input.current?.click()}>↥ Adicionar imagens</button><input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden aria-label="Arquivos de referência da categoria" onChange={event=>upload(event.target.files)}/><small>JPG, PNG e WebP · até 10 MB por imagem · {photos.length}/{MAX_CATEGORY_PHOTOS} imagens</small>
   </div>
   <details className="qc-reference-link"><summary>Adicionar imagem por link</summary><form onSubmit={addLink}><label className="qc-field"><span>Link direto da imagem (HTTPS)</span><input name="url" aria-label="Link da imagem de referência" type="url" placeholder="https://…/cozinha.jpg" required disabled={busy||!ready||!category||!!storageError}/></label><label className="qc-field"><span>Legenda (opcional)</span><input name="caption" aria-label="Legenda da imagem por link" maxLength={240} placeholder="Ex.: Bancada, iluminação e armários"/></label><button className="qc-button" type="submit" disabled={busy||!ready||!category||!!storageError||photos.length>=MAX_CATEGORY_PHOTOS}>Adicionar referência</button></form></details>
   {!photos.length&&ready&&!storageError&&<div className="qc-reference-empty"><strong>Sua primeira referência começa aqui</strong><p>Adicione uma foto ou crie uma categoria para organizar o que você quer comprar.</p></div>}
   <div className="qc-reference-grid">{photos.map((photo,position)=><article className="qc-reference-card" key={photo.id}><button type="button" className="qc-reference-thumbnail" onClick={()=>setViewingId(photo.id)} aria-label={`Ampliar referência ${position+1}: ${photo.caption||'Sem legenda'}`}><ReferenceImage photo={photo}/><span>Ampliar ↗</span></button><label className="qc-field"><span>Legenda</span><input key={`${photo.id}-${photo.caption}`} aria-label={`Legenda da referência ${position+1}`} defaultValue={photo.caption} placeholder="O que você quer aproveitar desta imagem?" maxLength={240} onBlur={event=>{if(event.target.value.trim()!==photo.caption)run({type:'caption',id:photo.id,caption:event.target.value},'Legenda salva.');}}/></label>{removeId===photo.id?<div className="qc-reference-remove"><span>Remover esta imagem?</span><button className="qc-button qc-danger" type="button" disabled={busy} onClick={async()=>{if(await run({type:'remove',id:photo.id},'Imagem removida.'))setRemoveId(null);}}>Confirmar remoção</button><button className="qc-text-button" type="button" onClick={()=>setRemoveId(null)}>Cancelar</button></div>:<button className="qc-text-button" type="button" disabled={busy} aria-label={`Remover referência ${position+1}`} onClick={()=>setRemoveId(photo.id)}>Remover</button>}</article>)}</div>
   {category&&<div className="qc-form-footer"><button type="button" className="qc-button qc-primary" disabled={busy} onClick={()=>onAddItem(category)}>＋ Adicionar item nesta categoria</button></div>}
  </>}
 </div>;
}
