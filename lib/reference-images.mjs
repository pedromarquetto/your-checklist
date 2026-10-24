import {validateReferenceFile,resizeReference} from './category-gallery.mjs';

export function readReferenceImage(src){return new Promise((resolve,reject)=>{
 const image=new Image();image.referrerPolicy='no-referrer';
 const timer=setTimeout(()=>{image.onload=null;image.onerror=null;image.src='';reject(new Error('A imagem demorou para carregar. Tente outro arquivo ou link.'));},12000);
 image.onload=()=>{clearTimeout(timer);resolve(image);};
 image.onerror=()=>{clearTimeout(timer);reject(new Error('Não foi possível abrir a imagem. Use um arquivo válido ou o link direto da foto.'));};
 image.src=src;
});}
export async function prepareReferenceUpload(file){
 validateReferenceFile(file);
 const source=URL.createObjectURL(file);
 try{
  const image=await readReferenceImage(source),size=resizeReference(image.naturalWidth,image.naturalHeight);
  const canvas=document.createElement('canvas');canvas.width=size.width;canvas.height=size.height;
  const context=canvas.getContext('2d');if(!context)throw new Error('O navegador não conseguiu preparar a imagem.');
  context.fillStyle='#ffffff';context.fillRect(0,0,size.width,size.height);
  context.drawImage(image,0,0,size.width,size.height);
  const src=canvas.toDataURL('image/jpeg',0.84);
  if(!src.startsWith('data:image/jpeg;base64,'))throw new Error('O navegador não conseguiu converter a imagem.');
  return {src,width:size.width,height:size.height,fileName:file.name};
 }finally{URL.revokeObjectURL(source);}
}
