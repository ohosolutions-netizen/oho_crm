import {randomUUID} from 'node:crypto';
import {rows,insert} from '../catalyst/client.mjs';
import {project} from '../catalyst/projections.mjs';
import {encodeNativePayload} from '../catalyst/native-record-codec.mjs';

const phone='9000000404', title='OHO CRM Manual Test Lead';
for(const row of await rows('Leads')){try{const frame=JSON.parse(row.DataJson||'{}'),record=frame.record||frame,data=JSON.parse(record.data||'{}');if(data.phone===phone||record.title===title){console.log(JSON.stringify({created:false,id:record.id,title:record.title}));process.exit(0);}}catch{}}
const users=await rows('Users',"Email='c8tyvch5hn@privaterelay.appleid.com' AND IsDeleted=false");
if(!users.length)throw new Error('Manual test owner not found.');
const now=new Date().toISOString(),id=randomUUID(),ownerId=users[0].AppId;
const data={companyName:'OHO Manual Test Company',contactName:'Manual Test Contact',email:'manual.test@example.invalid',phone,source:'Other',status:'New Lead',receivedDate:now.slice(0,10),receivedTime:new Date().toLocaleTimeString('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit'}),requirements:'Training example for the OHO CRM user manual',notes:'Use this record for training and demonstrations.',currency:'INR',importOrigin:'Manual training record'};
const record={id,module:'enquiries',title,owner_id:ownerId,company_id:null,data:JSON.stringify(data),created_at:now,updated_at:now};
const audit={id:randomUUID(),actor_id:ownerId,action:'create',target:'record:'+id,details:JSON.stringify({module:'enquiries',title,data,source:'User manual preparation'}),created_at:now};
const state={roles:[],profiles:[],users:[],records:[record],audit:[],settings:[]},row=project(state).Leads[0],encoded=encodeNativePayload({_nativeRecord:true,record,audit,references:[]});
row.DataJson=encoded.data;
if(encoded.chunks.length)await insert('BackendChunks',encoded.chunks);
await insert('Leads',[row]);
const auditState={roles:[],profiles:[],users:[],records:[],audit:[audit],settings:[]},auditRow=project(auditState).AuditLog[0];auditRow.DataJson=JSON.stringify(audit);await insert('AuditLog',[auditRow]);
console.log(JSON.stringify({created:true,id,title}));
