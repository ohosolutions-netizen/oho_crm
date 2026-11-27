import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {current} from './context.mjs';
import {context,allRecords,canSee,permit,database,rows,APIError} from '../../lib/server.ts';
const max=5*1024*1024;
const proposalFolderId=process.env.OHO_PROPOSAL_FOLDER_ID||'77605000000055732';
const trustedUploadOrigins=new Set([
 'https://oho-crm-60091125992.development.catalystserverless.in',
 'https://oho-crm-60091125992.catalystserverless.in',
 'https://crm.ohosolutions.in',
]);
export function uploadOriginAllowed(origin){
 if(!origin)return true;
 try{return trustedUploadOrigins.has(new URL(origin).origin);}catch{return false;}
}
function folder(){return current().app.filestore().folder(proposalFolderId);}
export async function documents(req,url,bytes){
 const c=await context();
 if(req.method==='GET'){
  const id=url.searchParams.get('id');const metadata=(await rows('SELECT value FROM settings WHERE key=?','proposal-upload:'+id))[0];if(!metadata)throw new APIError('Document unavailable.',404);const doc=JSON.parse(metadata.value),opportunity=(await allRecords("id=? AND module='opportunities'",[doc.opportunityId]))[0];if(!opportunity||!canSee(c,opportunity))throw new APIError('Document unavailable.',404);permit(c,'opportunities','view');permit(c,'proposals','view');
  const data=await current().app.filestore().folder(doc.folderId).downloadFile(doc.fileId);return new Response(data,{headers:{'Content-Type':doc.mime,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(doc.name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }
 if(req.method!=='POST')throw new APIError('Method not allowed.',405);
 if(!uploadOriginAllowed(req.headers.origin))throw new APIError('Upload request denied.',403);
 const opportunityId=url.searchParams.get('opportunityId'),opportunity=(await allRecords("id=? AND module='opportunities'",[opportunityId]))[0];if(!opportunity||!canSee(c,opportunity))throw new APIError('Opportunity unavailable.',404);permit(c,'opportunities','edit');permit(c,'proposals','create');
 if(['Accepted','Closed lost'].includes(opportunity.data.stage))throw new APIError('Reopen the opportunity before sending another revision.');
 let name;try{name=decodeURIComponent(req.headers['x-oho-filename']||'');}catch{throw new APIError('Choose a valid document.');}name=name.replace(/[\\/\x00-\x1f]/g,'_').slice(0,180);
 const ext=name.split('.').pop()?.toLowerCase(),types={pdf:'application/pdf',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xls:'application/vnd.ms-excel',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',ppt:'application/vnd.ms-powerpoint',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation'};
 if(!types[ext]||!bytes?.length||bytes.length>max)throw new APIError('Choose a PDF, Word, Excel or PowerPoint document up to 5 MB.');
 const valid=ext==='pdf'?bytes.subarray(0,5).toString()==='%PDF-':ext.endsWith('x')?bytes.subarray(0,2).toString()==='PK':bytes.subarray(0,4).toString('hex')==='d0cf11e0';if(!valid)throw new APIError('The document content does not match its file type.');
 const dir=await mkdtemp(join(tmpdir(),'oho-proposal-'));let uploaded,store;const started=Date.now();
 try{await writeFile(join(dir,name),bytes);store=folder();uploaded=await store.uploadFile({name,code:createReadStream(join(dir,name))});const doc={id:crypto.randomUUID(),opportunityId:opportunity.id,actorId:c.me.id,name,size:bytes.length,mime:types[ext],folderId:proposalFolderId,fileId:String(uploaded.id),uploadedAt:new Date().toISOString()};await database().prepare('INSERT INTO settings (key,value) VALUES (?,?)').bind('proposal-upload:'+doc.id,JSON.stringify(doc)).run();console.log('Proposal document stored',{opportunityId:opportunity.id,size:bytes.length,durationMs:Date.now()-started});return Response.json({id:doc.id,name:doc.name,size:doc.size});}
 catch(e){if(uploaded&&store)try{await store.deleteFile(String(uploaded.id));}catch{}if(e instanceof APIError)throw e;console.error('Proposal document storage failed:',e.message);throw new APIError('Unable to store the document. Please retry shortly.',503);}finally{await rm(dir,{recursive:true,force:true});}
}



