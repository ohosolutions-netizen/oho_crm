import {randomUUID} from 'node:crypto';
import {rows,first,insert,update,query,quote} from '../client.mjs';
import {project} from '../projections.mjs';
import {encodeNativePayload,decodeNativePayload} from '../native-record-codec.mjs';
import {leadId as mapLeadId,mapLead,sourceId,fetchFunctionIncremental} from './engine.mjs';
import {parseFunctionOutput} from './function-response.mjs';
const prefix='zoho-sync:',empty=()=>({roles:[],profiles:[],users:[],records:[],audit:[],settings:[]});
async function encode(value){const p=encodeNativePayload(value);for(let i=0;i<p.chunks.length;i+=100)await insert('BackendChunks',p.chunks.slice(i,i+100));return p.data;}
async function decode(row){const h=JSON.parse(row.DataJson);return decodeNativePayload(row.DataJson,h.bodyRef?await rows('BackendChunks','CommitAppId='+quote(h.bodyRef)):[]);}
export async function setting(key,value){const old=await first('Settings','SettingKey='+quote(prefix+key));const row={AppId:prefix+key,SettingKey:prefix+key,SettingValue:JSON.stringify(value).length>2000?'chunked':typeof value==='string'?value:JSON.stringify(value),DataJson:await encode({key:prefix+key,value:typeof value==='string'?value:JSON.stringify(value)}),IsDeleted:false};if(old)await update('Settings',[{...row,ROWID:old.ROWID}]);else await insert('Settings',[row]);}
export async function runLeadSync(){
 if(!process.env.ZOHO_CRM_FUNCTION_API_KEY)throw Error('Sync API key is not configured');
 const endpoint=new URL(process.env.ZOHO_CRM_FUNCTION_URL||'');if(endpoint.origin!=='https://www.zohoapis.com'||endpoint.pathname!=='/crm/v7/functions/catalyst_data_integrator/actions/execute')throw Error('Unexpected Zoho function endpoint');
 let lock=await first('Settings','SettingKey='+quote(prefix+'lock'));if(!lock){try{await setting('lock','idle');}catch{}lock=await first('Settings','SettingKey='+quote(prefix+'lock'));}if(!lock)throw Error('Cannot initialise sync lock');
 const old=lock.SettingValue||'idle';if(old!=='idle'&&Date.now()-Number(old.split(':')[0])<20*60*1000)return {status:'busy'};
 const token=Date.now()+':'+randomUUID();const acquired=await query('UPDATE Settings SET SettingValue='+quote(token)+' WHERE AppId='+quote(prefix+'lock')+' AND SettingValue='+quote(old));if(!acquired.length)return {status:'busy'};
 try{
  const users=[];for(const row of await rows('Users','IsDeleted=false')){const u=await decode(row);if(u.active)users.push(u);}
  const fallback=users.find(u=>u.id===process.env.ZOHO_SYNC_FALLBACK_OWNER)||users.find(u=>u.email==='c8tyvch5hn@privaterelay.appleid.com');if(!fallback)throw Error('No active fallback owner');
  const stateRow=await first('Settings','SettingKey='+quote(prefix+'state'));const state=stateRow?JSON.parse(stateRow.SettingValue):{checkpoint:process.env.ZOHO_SYNC_INITIAL_FROM};if(!Number.isFinite(Date.parse(state.checkpoint)))throw Error('Initial sync timestamp is not configured');
  const baseline=await first('Settings','SettingKey='+quote(prefix+'existing-ids'));if(!baseline)throw Error('Existing lead ID index is not initialised');const known=new Set(JSON.parse((await decode(baseline)).value));
  const now=new Date().toISOString();let quarantined=0,retried=0;
  async function ingest(lead,allowQueue=true){
   const id=sourceId(lead.id);if(!/^\d+$/.test(id))throw Error('Source returned an invalid lead ID');
   if(known.has(id)||await first('Leads','AppId='+quote(mapLeadId(id))))return 'skipped';
   const owner=users.find(u=>lead.Owner?.id&&sourceId(u.auth_id)===sourceId(lead.Owner.id))||users.find(u=>u.email&&lead.Owner?.email&&u.email.toLowerCase()===lead.Owner.email.toLowerCase())||users.find(u=>u.name?.toLowerCase()===lead.Owner?.name?.toLowerCase())||fallback;
   let record;try{record=mapLead(lead,owner.id,now);}catch(e){if(!allowQueue)return 'pending';await setting('pending:'+id,{lead,reason:e.message,queuedAt:now});quarantined++;return 'quarantined';}
   const audit={id:'zoho-sync:'+id,actor_id:owner.id,action:'create',target:'record:'+record.id,details:JSON.stringify({module:'enquiries',source:'Zoho CRM scheduled intake',zohoCRMId:id}),created_at:now};
   const projected=project({...empty(),records:[record],audit:[audit]});const row=projected.Leads[0];row.DataJson=await encode({_nativeRecord:true,record,audit,references:[]});
   try{await insert('Leads',[row]);}catch(e){if(await first('Leads','AppId='+quote(record.id)))return 'skipped';throw e;}
   // Record envelope retains audit for repair if the audit projection fails.
   try{const a=projected.AuditLog[0];a.DataJson=await encode(audit);await insert('AuditLog',[a]);}catch{console.warn('Lead sync audit projection pending');}
   known.add(id);return 'imported';
  }
  async function callSource(args){
   const url=new URL(endpoint);url.searchParams.set('auth_type','apikey');url.searchParams.set('zapikey',process.env.ZOHO_CRM_FUNCTION_API_KEY);for(const [key,value] of Object.entries(args))url.searchParams.set(key,value);
   let response;try{response=await fetch(url,{method:'POST',signal:AbortSignal.timeout(45000)});}catch{throw Error('Zoho function request failed or timed out');}
   let body;try{body=await response.json();}catch{throw Error('Zoho returned an invalid response');}if(!response.ok||body.code!=='success')throw Error('Zoho function failed: '+String(body.code||response.status));return parseFunctionOutput(body.details?.output);
  }
  for(const row of await rows('Settings',"SettingKey LIKE 'zoho-sync:pending:*' AND IsDeleted=false")){const item=JSON.parse((await decode(row)).value);const created=Date.parse(item.lead.Created_Time);const iso=t=>new Date(t).toISOString().replace(/\.\d{3}Z$/,'Z');const latest=await callSource({last_sync_time:iso(created-1000),sync_until:iso(created+1000),after_id:(BigInt(sourceId(item.lead.id))-1n).toString()});const fresh=latest.data.find(l=>sourceId(l.id)===sourceId(item.lead.id))||item.lead;const outcome=await ingest(fresh,false);if(outcome!=='pending'){await update('Settings',[{ROWID:row.ROWID,IsDeleted:true}]);if(outcome==='imported')retried++;}}
  const result=await fetchFunctionIncremental({checkpoint:state.checkpoint,windowEnd:now.replace(/\.\d{3}Z$/,'Z'),overlapSeconds:stateRow?120:0,onLead:ingest,callFunction:callSource
  });
  const report={...result,retried,quarantined,status:'success',lastRunAt:now,initialFrom:state.initialFrom||state.checkpoint};await setting('state',report);await setting('last-run',report);console.log(JSON.stringify(report));return report;
 }catch(e){await setting('last-run',{status:'failed',at:new Date().toISOString(),error:e.message});throw e;}
 finally{await query("UPDATE Settings SET SettingValue='idle' WHERE AppId="+quote(prefix+'lock')+' AND SettingValue='+quote(token));}
}
