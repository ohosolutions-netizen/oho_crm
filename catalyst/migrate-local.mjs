import {DatabaseSync} from 'node:sqlite';
import {mkdir,writeFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {latest,persist,entities,restore} from './state.mjs';
import {sync} from './projections.mjs';
const current=await latest();
if(current){const {state}=await restore(current);await sync(state);console.log(`Catalyst already initialized at revision ${current.Revision}; reconciled tables.`);process.exit(0);}
const dir=new URL('../.wrangler/state/v3/d1/miniflare-D1DatabaseObject/',import.meta.url);
const files=(await readdir(dir)).filter(f=>f.endsWith('.sqlite')&&f!=='metadata.sqlite');
if(files.length!==1)throw new Error('Expected one local CRM database; migration requires explicit database selection.');
const db=new DatabaseSync(new URL(files[0],dir),{readOnly:true});
db.exec('BEGIN');const state=Object.fromEntries(entities.map(t=>[t,db.prepare(`SELECT * FROM ${t}`).all()]));db.exec('COMMIT');db.close();
await mkdir(new URL('../.sites-runtime/backups/',import.meta.url),{recursive:true});
await writeFile(new URL(`../.sites-runtime/backups/pre-catalyst-${Date.now()}.json`,import.meta.url),JSON.stringify(state,null,2));
const commit=await persist(state,0);await sync(state);
console.log(JSON.stringify({migrated:true,revision:commit.Revision,records:state.records.length,users:state.users.length,sourceRetained:true}));
