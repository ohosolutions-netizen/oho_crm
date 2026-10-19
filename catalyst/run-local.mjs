import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
let token;try{token=(await readFile(new URL('../.sites-runtime/catalyst-bridge-token',import.meta.url),'utf8')).trim();}catch{await mkdir(new URL('../.sites-runtime/',import.meta.url),{recursive:true});token=randomBytes(32).toString('hex');await writeFile(new URL('../.sites-runtime/catalyst-bridge-token',import.meta.url),token);}
const children=[];
const launch=(args,env=process.env)=>{const child=spawn(process.execPath,args,{stdio:'inherit',env,windowsHide:true});children.push(child);child.on('exit',code=>{if(!stopping){stop();process.exitCode=code||0;}});return child;};
let stopping=false;function stop(){stopping=true;for(const child of children)child.kill();}
process.on('SIGINT',stop);process.on('SIGTERM',stop);process.on('exit',stop);
const {latest}=await import('./state.mjs');
if(!await latest()){
  console.log('Catalyst migration pending: using saved local data. Enable Datastore inserts, then run node catalyst/migrate-local.mjs.');
  launch(['scripts/run-framework.mjs','dev','--hostname','127.0.0.1']);
}else{
launch(['catalyst/bridge.mjs']);
for(let i=0;i<30;i++){try{const response=await fetch('http://127.0.0.1:5174/health',{headers:{'X-OHO-Backend-Token':token}});if(response.ok)break;}catch{}if(i===29){stop();throw new Error('Catalyst bridge did not start.');}await new Promise(r=>setTimeout(r,500));}
launch(['scripts/run-framework.mjs','dev','--hostname','127.0.0.1'],{...process.env,OHO_CATALYST_URL:'http://127.0.0.1:5174',OHO_CATALYST_TOKEN:token});
}
