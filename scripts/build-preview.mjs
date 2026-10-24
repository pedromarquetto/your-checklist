import {build} from 'esbuild';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const result=await build({entryPoints:[path.join(root,'scripts/preview-entry.jsx')],bundle:true,write:false,minify:true,format:'iife',platform:'browser',target:'es2022',define:{'process.env.NODE_ENV':'"production"'},legalComments:'none',plugins:[{name:'inline-shopping-adapter',setup(builder){builder.onResolve({filter:/shopping-client\.mjs$/},()=>({path:path.join(root,'scripts/shopping-preview.mjs')}));}}]});
const shell=await readFile(path.join(root,'scripts/preview-shell.html'),'utf8');
const css=await readFile(path.join(root,'app/globals.css'),'utf8');
// SheetJS includes HTML-document strings for its HTML export feature. Preserve
// their runtime value while keeping the inline fragment free of document markup.
const code=result.outputFiles[0].text
 .replace(/<(?=\/?(?:html|head|body)(?:\s|>)|!doctype\s)/gi,'\\x3c')
 .replace(/<\/script/gi,'<\\/script');
const fragment=shell.replace('/*__QC_CSS__*/',()=>css).replace('/*__QC_JS__*/',()=>code);
if(Buffer.byteLength(fragment)>1000000)throw new Error('Preview exceeds 1 MB');
if(/<!doctype\s|<\s*(?:html|head|body)(?:\s|>)/i.test(fragment))throw new Error('Preview contains document markup instead of an inline fragment');
const output=process.argv[2]||path.join(root,'preview/your-checklist-v1.html');
await mkdir(path.dirname(output),{recursive:true});
await writeFile(output,fragment);
await mkdir(path.join(root,'public'),{recursive:true});
await writeFile(path.join(root,'public/preview.html'),'<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your Checklist · Prévia V1</title></head><body style="margin:0">'+fragment+'</body></html>');
console.log(`Preview created: ${Buffer.byteLength(fragment)} bytes`);
