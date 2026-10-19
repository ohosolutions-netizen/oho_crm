import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
const require=createRequire(import.meta.url);
const {build}=require('esbuild');
const schema=await readFile(new URL('../drizzle/0000_damp_adam_warlock.sql',import.meta.url),'utf8');
const columns=await readFile(new URL('./schema.json',import.meta.url),'utf8');
await build({entryPoints:['catalyst/cloud/handler.mjs'],outfile:'catalyst/functions/ohocrm/handler.cjs',bundle:true,platform:'node',format:'cjs',target:'node22',external:['zcatalyst-sdk-node'],plugins:[{name:'catalyst-runtime',setup(b){
  b.onResolve({filter:/^cloudflare:workers$/},()=>({path:resolve('catalyst/cloud/runtime.mjs')}));
  b.onResolve({filter:/^next\/headers$/},()=>({path:resolve('catalyst/cloud/headers.mjs')}));
  b.onResolve({filter:/^\.\/client\.mjs$/},args=>args.importer.endsWith('state.mjs')||args.importer.endsWith('projections.mjs')||args.importer.endsWith('native-store.mjs')?{path:resolve('catalyst/cloud/client.mjs')}:undefined);
  b.onLoad({filter:/[\\/]state\.mjs$/},async args=>({contents:(await readFile(args.path,'utf8')).replace(/const sql=await readFile\([^;]+;/,`const sql=${JSON.stringify(schema)};`),loader:'js'}));
  b.onLoad({filter:/[\\/]projections\.mjs$/},async args=>({contents:(await readFile(args.path,'utf8')).replace(/const schema=JSON.parse\(await readFile\([^;]+;/,`const schema=${columns};`),loader:'js'}));
}}]});
await writeFile(new URL('./functions/ohocrm/index.js',import.meta.url),"module.exports = require('./handler.cjs').default;\n");
console.log('Built Catalyst CRM server function without local CLI credentials.');
