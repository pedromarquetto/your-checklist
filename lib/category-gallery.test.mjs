import test from 'node:test';
import assert from 'node:assert/strict';
import {galleryKey,categoryNames,applyGalleryChange,validateReferenceFile,resizeReference,MAX_CATEGORY_PHOTOS} from './category-gallery.mjs';
const scope={projectId:'apartment',category:'Cozinha planejada'};
const photo=(id,src=`https://example.com/${id}.jpg`)=>({id,src,caption:id,createdAt:'2026-10-24T12:00:00Z'});
test('galleries are isolated by project and normalized category, including names with delimiters',()=>{
 assert.equal(galleryKey('a',' Eletrodomésticos '),galleryKey('a','eletrodomesticos'));
 assert.notEqual(galleryKey('a','Cozinha'),galleryKey('b','Cozinha'));
 assert.notEqual(galleryKey('a|b','c'),galleryKey('a','b|c'));
 const gallery=applyGalleryChange(null,scope,{type:'add',photos:[photo('one')]});
 assert.equal(applyGalleryChange(gallery,{...scope,projectId:'beach'},{type:'create'}).photos.length,0);
});
test('categories with references can exist before items and are included in pickers',()=>{
 const gallery=applyGalleryChange(null,scope,{type:'create'});assert.deepEqual(gallery.photos,[]);
 assert.deepEqual(categoryNames([{category:'Móveis'},{category:'moveis'}],[gallery]),['Cozinha planejada','Móveis']);
});
test('multi-image import ignores repeats and enforces the category limit without mutating previous references',()=>{
 const gallery=applyGalleryChange(null,scope,{type:'add',photos:[photo('a'),photo('b'),photo('duplicate','https://example.com/a.jpg')]});
 assert.equal(gallery.photos.length,2);
 const updated=applyGalleryChange(gallery,scope,{type:'add',photos:[photo('a'),photo('c')]});
 assert.equal(updated.photos.length,3);assert.equal(gallery.photos.length,2);
 const batch=Array.from({length:MAX_CATEGORY_PHOTOS},(_,index)=>photo(`extra-${index}`));
 assert.throws(()=>applyGalleryChange(updated,scope,{type:'add',photos:batch}),/24/);
 assert.equal(updated.photos.length,3);
});
test('caption edits and removals keep other image records intact',()=>{
 const gallery=applyGalleryChange(null,scope,{type:'add',photos:[photo('a'),photo('b')]});
 const edited=applyGalleryChange(gallery,scope,{type:'caption',id:'a',caption:'  Bancada e armários  '});
 assert.equal(edited.photos[0].caption,'Bancada e armários');assert.deepEqual(edited.photos[1],gallery.photos[1]);
 assert.deepEqual(applyGalleryChange(edited,scope,{type:'remove',id:'a'}).photos,[photo('b')]);
});
test('invalid files and image sources are rejected before saving',()=>{
 assert.throws(()=>validateReferenceFile({type:'image/svg+xml',size:30}),/JPG/);
 assert.throws(()=>validateReferenceFile({type:'image/jpeg',size:11*1024*1024}),/10 MB/);
 validateReferenceFile({type:'image/png',size:1000});
 for(const src of ['javascript:alert(1)','http://example.com/a.jpg','data:image/svg+xml,test'])assert.throws(()=>applyGalleryChange(null,scope,{type:'add',photos:[photo('x',src)]}),/HTTPS/);
 const valid=applyGalleryChange(null,scope,{type:'add',photos:[photo('x','data:image/jpeg;base64,YWJjZA==')]});assert.equal(valid.photos.length,1);
});
test('image resizing preserves aspect ratio and never upscales small references',()=>{
 assert.deepEqual(resizeReference(6000,3000),{width:2048,height:1024});
 assert.deepEqual(resizeReference(3000,6000),{width:1024,height:2048});
 assert.deepEqual(resizeReference(640,480),{width:640,height:480});
 assert.throws(()=>resizeReference(0,100),/dimensões/);
});
