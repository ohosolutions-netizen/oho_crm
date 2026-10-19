import {Readable} from 'node:stream';
import {createGzip} from 'node:zlib';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {rows,insert,quote,first} from './client.mjs';
const sql=await readFile(new URL('../drizzle/0000_damp_adam_warlock.sql',import.meta.url),'utf8');
import {entities,applyDelta,deltaPayload} from './delta.mjs';
export {entities,applyDelta,deltaPayload};
export function memory(state){
  const db=new DatabaseSync(':memory:');db.exec(sql);db.exec('PRAGMA foreign_keys=OFF');
  for(const table of entities){const statements=new Map();for(const row of state[table]||[]){const keys=Object.keys(row),key=keys.join(',');let statement=statements.get(key);if(!statement){statement=db.prepare(`INSERT INTO ${table} (${key}) VALUES (${keys.map(()=>'?').join(',')})`);statements.set(key,statement);}statement.run(...Object.values(row));}}
  db.exec('PRAGMA foreign_keys=ON');return db;
}
export function snapshot(db){return Object.fromEntries(entities.map(t=>[t,db.prepare(`SELECT * FROM ${t}`).all().map(r=>({...r}))]));}
export const checksum=text=>createHash('sha256').update(text).digest('hex');
export async function latest(){const commit=await first('BackendCommits','','ORDER BY Revision DESC');if(!commit)return null;for(const key of ['Revision','PreviousRevision','ChunkCount'])commit[key]=Number(commit[key]);return commit;}
function decodeCheckpoint(commit,chunks){const unique=new Map();for(const chunk of chunks){const previous=unique.get(chunk.ChunkKey);if(previous&&previous.Payload!==chunk.Payload)throw new Error('Conflicting Catalyst checkpoint chunks.');unique.set(chunk.ChunkKey,chunk);}const ordered=[...unique.values()].sort((a,b)=>Number(a.ChunkKey.split(':').at(-1))-Number(b.ChunkKey.split(':').at(-1)));if(ordered.length!==Number(commit.ChunkCount))throw new Error('Catalyst checkpoint is incomplete.');const text=gunzipSync(Buffer.from(ordered.map(r=>r.Payload).join(''),'base64')).toString();if(checksum(text)!==commit.Checksum)throw new Error('Catalyst checkpoint checksum mismatch.');return JSON.parse(text);}
export async function readCheckpoint(commit){return decodeCheckpoint(commit,await rows('BackendChunks','CommitAppId='+quote(commit.AppId)));}
export async function restore(commit){
  if(!commit)return {revision:0,state:Object.fromEntries(entities.map(t=>[t,[]]))};
  const chain=[];let base=commit;
  if(commit.AppId.startsWith('delta:')){const history=await rows('BackendCommits','Revision>='+Math.max(1,Number(commit.Revision)-100)+' AND Revision<='+Number(commit.Revision)),byRevision=new Map(history.map(c=>[Number(c.Revision),c]));while(base.AppId.startsWith('delta:')){chain.push(base);base=byRevision.get(Number(base.PreviousRevision));if(!base)throw new Error('Missing delta predecessor.');}}
  const state=await readCheckpoint(base);if(!entities.every(table=>Array.isArray(state[table])))throw new Error('Invalid base checkpoint.');
  const chunks=chain.length?await rows('BackendChunks','CommitAppId IN ('+chain.map(c=>quote(c.AppId)).join(',')+')'):[],byCommit=new Map();for(const chunk of chunks){const list=byCommit.get(chunk.CommitAppId)||[];list.push(chunk);byCommit.set(chunk.CommitAppId,list);}
  for(const step of chain.reverse()){const delta=decodeCheckpoint(step,byCommit.get(step.AppId)||[]);if(delta.baseRevision!==Number(step.PreviousRevision))throw new Error('Invalid delta predecessor.');applyDelta(state,delta);}
  return {revision:Number(commit.Revision),state};
}
export async function persistChanges(after,before,previousRevision){
  const text=JSON.stringify(deltaPayload(after,before,previousRevision)),compressed=gzipSync(text).toString('base64'),id='delta:'+(['roles','profiles','users'].some(t=>(after[t]||[]).length||(before[t]||[]).length)?'config:':'')+randomUUID(),chunks=[];
  for(let i=0;i<compressed.length;i+=8000)chunks.push({AppId:randomUUID(),CommitAppId:id,ChunkKey:id+':'+chunks.length,Payload:compressed.slice(i,i+8000)});
  for(let i=0;i<chunks.length;i+=100)await insert('BackendChunks',chunks.slice(i,i+100));
  const commit={AppId:id,Revision:previousRevision+1,RevisionKey:String(previousRevision+1),PreviousRevision:previousRevision,ChunkCount:chunks.length,Checksum:checksum(text),CommittedAt:new Date().toISOString()};
  try{await insert('BackendCommits',[commit]);}catch(error){const current=await latest();if(current?.AppId===id)return commit;if(current&&current.Revision>previousRevision)throw Object.assign(new Error('The CRM changed concurrently. Refresh and retry.'),{status:409});throw error;}
  return commit;
}
export async function persist(state,previousRevision,configuration=false){
  const text=JSON.stringify(state),compressed=gzipSync(text).toString('base64'),id=(configuration?'snapshot:config:':'')+randomUUID();
  const chunks=[];for(let i=0;i<compressed.length;i+=8000)chunks.push({AppId:randomUUID(),CommitAppId:id,ChunkKey:`${id}:${chunks.length}`,Payload:compressed.slice(i,i+8000)});
  // Upload immutable chunks first. The unique revision is the atomic visibility point.
  // Losing concurrent writers leave unreferenced chunks; readers never load those.
  for(let i=0;i<chunks.length;i+=100)await insert('BackendChunks',chunks.slice(i,i+100));
  const commit={AppId:id,Revision:previousRevision+1,RevisionKey:String(previousRevision+1),PreviousRevision:previousRevision,ChunkCount:chunks.length,Checksum:checksum(text),CommittedAt:new Date().toISOString()};
  try{await insert('BackendCommits',[commit]);}catch(error){
    // A network timeout may follow a successful remote commit. Resolve it by ID.
    const current=await latest();if(current?.AppId===id)return commit;
    if(current&&current.Revision>previousRevision)throw Object.assign(new Error('The CRM changed concurrently. Refresh and retry.'),{status:409});
    throw error;
  }
  return commit;
}

export async function persistDatabase(db,previousRevision,configuration=false){
  const hash=createHash('sha256'),parts=[];
  function* serialize(){let firstTable=true;yield '{';for(const table of entities){if(!firstTable)yield ',';firstTable=false;yield JSON.stringify(table)+':[';let firstRow=true;for(const row of db.prepare('SELECT * FROM '+table).iterate()){if(!firstRow)yield ',';firstRow=false;yield JSON.stringify(row);}yield ']';}yield '}';}
  function* hashed(){for(const part of serialize()){hash.update(part);yield part;}}
  const stream=Readable.from(hashed()).pipe(createGzip());for await(const part of stream)parts.push(part);
  const compressed=Buffer.concat(parts).toString('base64'),id=(configuration?'snapshot:config:':'')+randomUUID(),chunks=[];
  for(let i=0;i<compressed.length;i+=8000)chunks.push({AppId:randomUUID(),CommitAppId:id,ChunkKey:id+':'+chunks.length,Payload:compressed.slice(i,i+8000)});
  for(let i=0;i<chunks.length;i+=100)await insert('BackendChunks',chunks.slice(i,i+100));
  const commit={AppId:id,Revision:previousRevision+1,RevisionKey:String(previousRevision+1),PreviousRevision:previousRevision,ChunkCount:chunks.length,Checksum:hash.digest('hex'),CommittedAt:new Date().toISOString()};
  try{await insert('BackendCommits',[commit]);}catch(error){const current=await latest();if(current?.AppId===id)return commit;if(current&&current.Revision>previousRevision)throw Object.assign(new Error('The CRM changed concurrently. Refresh and retry.'),{status:409});throw error;}
  return commit;
}
