import {normalize,safeImageUrl} from './core.mjs';

export const MAX_CATEGORY_PHOTOS=24;
export const MAX_REFERENCE_FILE_BYTES=10*1024*1024;
export const REFERENCE_MIME_TYPES=['image/jpeg','image/png','image/webp'];
export function galleryKey(projectId,category){return JSON.stringify([projectId,normalize(category)]);}
export function categoryNames(items,galleries=[]){
 const names=new Map();
 for(const name of [...items.map(item=>item.category),...galleries.map(gallery=>gallery.category)])if(String(name||'').trim()&&!names.has(normalize(name)))names.set(normalize(name),name.trim());
 return [...names.values()].sort((a,b)=>a.localeCompare(b,'pt-BR'));
}
export function validateReferenceFile(file){
 if(!REFERENCE_MIME_TYPES.includes(file.type))throw new Error('Use imagens JPG, PNG ou WebP.');
 if(!file.size||file.size>MAX_REFERENCE_FILE_BYTES)throw new Error('Cada imagem deve ter até 10 MB.');
}
export function resizeReference(width,height,maximum=2048){
 if(!(width>0&&height>0))throw new Error('Não foi possível ler as dimensões da imagem.');
 const scale=Math.min(1,maximum/Math.max(width,height));
 return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
}
function validPhoto(photo){return photo&&typeof photo.id==='string'&&(safeImageUrl(photo.src)||/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(photo.src||''));}
export function applyGalleryChange(current,{projectId,category},action){
 category=String(category||'').trim();if(!category||category.length>80)throw new Error('Informe uma categoria de até 80 caracteres.');
 const key=galleryKey(projectId,category);
 const gallery=current?.key===key?current:{key,projectId,category,photos:[]};
 const photos=Array.isArray(gallery.photos)?gallery.photos:[];
 let next=photos;
 if(action.type==='add'){
  const seen=new Set(photos.map(photo=>photo.src));
  const additions=[];
  for(const photo of action.photos){
   if(!validPhoto(photo))throw new Error('A referência precisa ser uma imagem válida ou um link HTTPS.');
   if(seen.has(photo.src))continue;
   seen.add(photo.src);additions.push({...photo,caption:String(photo.caption||'').trim().slice(0,240)});
  }
  if(photos.length+additions.length>MAX_CATEGORY_PHOTOS)throw new Error(`Cada categoria aceita até ${MAX_CATEGORY_PHOTOS} imagens.`);
  next=[...photos,...additions];
 }else if(action.type==='caption')next=photos.map(photo=>photo.id===action.id?{...photo,caption:String(action.caption||'').trim().slice(0,240)}:photo);
 else if(action.type==='remove')next=photos.filter(photo=>photo.id!==action.id);
 else if(action.type!=='create')throw new Error('Alteração de galeria inválida.');
 return {...gallery,photos:next};
}

const DB_NAME='your-checklist-category-references';
const STORE='galleries';
function openDatabase(){return new Promise((resolve,reject)=>{
 if(!globalThis.indexedDB){reject(new Error('Este navegador não permite salvar a galeria.'));return;}
 const request=indexedDB.open(DB_NAME,1);
 request.onupgradeneeded=()=>{const store=request.result.createObjectStore(STORE,{keyPath:'key'});store.createIndex('projectId','projectId');};
 request.onsuccess=()=>{request.result.onversionchange=()=>request.result.close();resolve(request.result);};
 request.onerror=()=>reject(request.error);
 request.onblocked=()=>reject(new Error('Feche outras abas do app e tente abrir a galeria novamente.'));
});}
export async function loadCategoryGalleries(projectId){
 const db=await openDatabase();
 return new Promise((resolve,reject)=>{
  const transaction=db.transaction(STORE,'readonly');
  const request=transaction.objectStore(STORE).index('projectId').getAll(projectId);
  transaction.oncomplete=()=>{db.close();resolve(request.result||[]);};
  transaction.onabort=()=>{db.close();reject(transaction.error||new Error('Não foi possível ler a galeria.'));};
 });
}
export async function changeCategoryGallery(projectId,category,action){
 const db=await openDatabase();
 return new Promise((resolve,reject)=>{
  const transaction=db.transaction(STORE,'readwrite'),store=transaction.objectStore(STORE);
  const request=store.get(galleryKey(projectId,category));let result,failure;
  request.onsuccess=()=>{try{result=applyGalleryChange(request.result,{projectId,category},action);store.put(result);}catch(error){failure=error;transaction.abort();}};
  transaction.oncomplete=()=>{db.close();resolve(result);};
  transaction.onabort=()=>{db.close();reject(failure||transaction.error||new Error('Não foi possível salvar a galeria.'));};
 });
}
