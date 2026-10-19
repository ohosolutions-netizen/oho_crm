import {spawnSync} from 'node:child_process';
import {copyFile,writeFile} from 'node:fs/promises';
const result=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build','--config','catalyst/web/vite.config.mjs'],{stdio:'inherit'});
if(result.status!==0)process.exit(result.status||1);
await writeFile(new URL('./hosted-client/client-package.json',import.meta.url),JSON.stringify({name:'OHO-CRM',version:'1.0.0',description:'OHO Solutions CRM with shared Catalyst backend storage.',homepage:'index.html'}));
