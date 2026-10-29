import {nativeWorkingState,mergeNativeRecords,recoverNativeLeases} from '../native-store.mjs';
import catalyst from 'zcatalyst-sdk-node';
import {gzipSync} from 'node:zlib';
import {requestContext} from './context.mjs';
import {latest,restore,memory} from '../state.mjs';
import * as crm from '../../app/api/crm/route.ts';
import * as identity from '../../app/api/identity/route.ts';
import {documents} from './documents.mjs';
let cached,tail=Promise.resolve();
async function loadDatabase(commit){if(cached?.revision===commit.Revision)return cached;cached?.db.close();cached=undefined;const restored=await restore(commit);return cached={revision:restored.revision,db:memory(restored.state),count:restored.state.records.length};}
export default async function handler(req,res){
  let release;const before=tail;tail=new Promise(resolve=>{release=resolve;});await before;
  const c={req,app:catalyst.initialize(req,{scope:'admin'})};
  await requestContext.run(c,async()=>{
    try{
      const url=new URL(req.url,'https://'+req.headers.host),path=url.pathname;
      let body;if(!path.endsWith('/api/documents')&&!['GET','HEAD'].includes(req.method)){if(req.body)body=typeof req.body==='string'?req.body:JSON.stringify(req.body);else{let raw='';for await(const part of req){raw+=part;if(raw.length>2000000)throw new Error('Request too large.');}body=raw;}}
      let input;try{input=body?JSON.parse(body):null;}catch{throw Object.assign(new Error('Invalid request body.'),{status:400});}
      const bootstrap=path.endsWith('/api/crm')&&req.method==='GET'&&url.searchParams.get('mode')==='bootstrap';
      const webhook=path.endsWith('/api/sarvam/webhook');
      const simple=bootstrap||webhook||path.endsWith('/api/identity')||path.endsWith('/api/crm')&&(req.method==='GET'&&url.searchParams.get('id')||req.method==='POST'&&['note','voice-call'].includes(input?.kind)||req.method==='POST'&&input?.kind==='record'&&['create','edit'].includes(input.operation)&&['leadEnquiries','contacts','opportunities','projects'].includes(input.module));
      let working;if(simple)try{working=await nativeWorkingState(webhook?{id:url.searchParams.get('leadId'),module:'enquiries',operation:'edit'}:input||{id:url.searchParams.get('id'),module:url.searchParams.get('recordModule'),operation:bootstrap?'bootstrap':'read'},bootstrap||path.endsWith('/api/identity'));}catch(e){if(e.status!==428)throw e;}
      if(working){c.db=memory(working.state);c.direct=true;c.nativeRegistry=working.registry;c.revision=0;}
      else{const commit=await latest();if(!commit)throw new Error('CRM migration has not completed.');const loaded=await loadDatabase(commit);c.db=loaded.db;c.revision=loaded.revision;await mergeNativeRecords(c.db,commit.CommittedAt,req.method==='POST');if(req.method==='POST')await recoverNativeLeases(c.db);}

      if(path.endsWith('/api/health')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({backend:'Zoho Catalyst',revision:c.revision,records:c.db.prepare('SELECT COUNT(*) AS count FROM records').get().count}));return;}
      if(path.endsWith('/api/documents')){let bytes;if(req.method==='POST'){if(Buffer.isBuffer(req.body))bytes=req.body;else{const parts=[];let size=0;for await(const part of req){size+=part.length;if(size>5*1024*1024)throw Object.assign(new Error('Choose a document up to 5 MB.'),{status:413});parts.push(part);}bytes=Buffer.concat(parts);}}const response=await documents(req,new URL(req.url,'https://'+req.headers.host),bytes);res.statusCode=response.status;for(const[k,v]of response.headers)res.setHeader(k,v);res.end(Buffer.from(await response.arrayBuffer()));return;}

      const request=new Request('https://'+req.headers.host+req.url,{method:req.method,headers:req.headers,body});
      let response;
      if(webhook)response=await crm.SARVAM_WEBHOOK(request);
      else if(path.endsWith('/api/identity'))response=req.method==='DELETE'?await identity.DELETE(request):await identity.POST(request);
      else if(path.endsWith('/api/crm'))response=req.method==='POST'?await crm.POST(request):await crm.GET(request);
      else response=Response.json({error:'Not found'},{status:404});
      if(req.method==='POST'&&path.endsWith('/api/crm')&&response.ok&&c.changedRecordIds){const reply=await response.json();response=Response.json({...reply,changes:await crm.changedRecords([...c.changedRecordIds])},{headers:{'Cache-Control':'no-store'}});}
      res.statusCode=response.status;for(const[k,v]of response.headers)res.setHeader(k,v);res.setHeader('X-OHO-Backend','Catalyst');res.setHeader('X-OHO-Revision',c.direct?'native':String(c.revision));res.setHeader('X-OHO-Storage',c.direct?'native-record':'transaction');
      const payload=Buffer.from(await response.text());if(payload.length>50000&&String(req.headers['accept-encoding']||'').includes('gzip')){res.setHeader('Content-Encoding','gzip');res.setHeader('Vary','Accept-Encoding');res.end(gzipSync(payload));}else res.end(payload);
    }catch(e){console.error('CRM request failed:',e.message);res.statusCode=e.status||503;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:e.status?e.message:'Catalyst backend unavailable. Please retry shortly.'} ));}
    finally{if(c.direct)c.db?.close();if(cached&&c.db===cached.db)cached.revision=c.revision;release();}
  });
}
