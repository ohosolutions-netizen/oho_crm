import {mergeNativeRecords,reserveDatabaseChanges,releaseRecords,checkNativeDeletions,markConfiguration} from './native-store.mjs';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {memory,snapshot,latest,restore,persist} from './state.mjs';
import {sync} from './projections.mjs';
const token=(await readFile(new URL('../.sites-runtime/catalyst-bridge-token',import.meta.url),'utf8')).trim();
const initial=await latest();
if(!initial)throw new Error('Catalyst migration is not complete. Run catalyst/migrate-local.mjs after enabling Datastore inserts.');
let db=memory((await restore(initial)).state),revision=initial.Revision,lastRead=0,projectionError='',queue=Promise.resolve();
async function refresh(force=false){if(!force&&Date.now()-lastRead<1000)return;const commit=await latest();if((commit?.Revision||0)!==revision){const restored=await restore(commit);db.close();db=memory(restored.state);revision=restored.revision;}await mergeNativeRecords(db,commit.CommittedAt);lastRead=Date.now();}
async function rpc(body){
  const commands=body.commands;if(!Array.isArray(commands)||!commands.length)throw new Error('Invalid database request.');
  const writes=commands.some(c=>!/^\s*SELECT\b/i.test(c.sql));await refresh(writes);const before=snapshot(db);
  let leases=[];if(writes)db.exec('BEGIN IMMEDIATE');
  try{
    const result=commands.map(c=>{if(typeof c.sql!=='string'||!Array.isArray(c.args))throw new Error('Invalid SQL request.');const stmt=db.prepare(c.sql);if(/^\s*SELECT\b/i.test(c.sql))return {results:stmt.all(...c.args),success:true,meta:{changes:0}};const r=stmt.run(...c.args);return {results:[],success:true,meta:{changes:Number(r.changes)}};});
    if(writes){const after=snapshot(db);if(JSON.stringify(after)!==JSON.stringify(before)){leases=await reserveDatabaseChanges(db,before,after);await checkNativeDeletions(before,after);const commit=await persist(after,revision,['roles','profiles','users'].some(t=>JSON.stringify(after[t])!==JSON.stringify(before[t])));revision=commit.Revision;}db.exec('COMMIT');try{await sync(after,before);if(['roles','profiles','users'].some(t=>JSON.stringify(after[t])!==JSON.stringify(before[t])))await markConfiguration(revision);projectionError='';}catch(e){projectionError=e.message;console.error('Catalyst table projections pending:',projectionError);}}
    await releaseRecords(leases);return {result,revision,projectionPending:!!projectionError};
  }catch(e){await releaseRecords(leases).catch(()=>{});if(writes){try{db.exec('ROLLBACK');}catch{}}lastRead=0;throw e;}
}
const server=createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
  if(req.headers['x-oho-backend-token']!==token||req.headers.origin){res.writeHead(403);res.end(JSON.stringify({error:'Backend request denied.'}));return;}
  try{if(req.url==='/health'){const task=queue.then(()=>refresh(true));queue=task.catch(()=>{});await task;res.end(JSON.stringify({backend:'Zoho Catalyst',revision,projectionPending:!!projectionError}));return;}
    if(req.url!=='/rpc'||req.method!=='POST')throw Object.assign(new Error('Not found'),{status:404});
    let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>2000000)throw new Error('Request too large.');}
    const body=JSON.parse(raw);const task=queue.then(()=>rpc(body));queue=task.catch(()=>{});res.end(JSON.stringify(await task));
  }catch(e){res.writeHead(e.status||503);res.end(JSON.stringify({error:e.message||'Catalyst unavailable.'}));}
});
server.listen(5174,'127.0.0.1',()=>console.log(`Catalyst backend bridge ready on 127.0.0.1:5174 (revision ${revision})`));
