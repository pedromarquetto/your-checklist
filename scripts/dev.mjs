import {spawn} from 'node:child_process';
// Accept the preview daemon's Vite-style flags and pass only Next.js flags.
const args=process.argv.slice(2);const value=(flag,fallback)=>{const index=args.indexOf(flag);return index<0?fallback:args[index+1];};
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname',value('--host','0.0.0.0'),'--port',value('--port','3000')],{stdio:'inherit'});
child.on('exit',code=>process.exit(code||0));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
