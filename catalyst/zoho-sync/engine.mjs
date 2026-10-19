import {createHash} from 'node:crypto';
export const sourceId=value=>String(value||'').replace(/^zcrm_/, '');
export function leadId(id){const hex=createHash('sha256').update('oho:zoho-lead:'+sourceId(id)).digest('hex').slice(0,32);return hex.slice(0,8)+'-'+hex.slice(8,12)+'-5'+hex.slice(13,16)+'-a'+hex.slice(17,20)+'-'+hex.slice(20);}
export function mapLead(lead,ownerId,now){
 const id=sourceId(lead.id),title=[lead.First_Name,lead.Last_Name].filter(Boolean).join(' ').trim()||lead.Full_Name||lead.Email;
 if(!id||!/^\d+$/.test(id))throw Error('Invalid Zoho lead ID');if(!title)throw Error('Missing lead name');if(!(lead.Phone||lead.Mobile||'').trim())throw Error('Missing mandatory lead phone');if(!ownerId)throw Error('No active intake owner');
 const created=new Date(lead.Created_Time);if(!Number.isFinite(created.getTime()))throw Error('Missing creation timestamp');
 const data={status:'New Lead',zohoCRMId:id,zohoCRMStatus:lead.Lead_Status||'',zohoCreatedTime:lead.Created_Time,zohoModifiedTime:lead.Modified_Time,companyName:lead.Company||'',contactName:title,email:lead.Email||'',phone:lead.Phone||lead.Mobile,source:lead.Lead_Source||'Other',requirements:lead.Description||'New enquiry received from Zoho CRM',notes:lead.Description||'',receivedTime:created.toLocaleTimeString('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit'}),receivedDate:created.toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'}),importOrigin:'Zoho CRM API',importedAt:now};
 return {id:leadId(id),module:'enquiries',title,owner_id:ownerId,company_id:null,data:JSON.stringify(data),created_at:created.toISOString(),updated_at:now};
}
export async function fetchIncremental({fetchPage,checkpoint,now,onLead,maxPages=500}){
 const since=new Date(Date.parse(checkpoint)-120000).toISOString();let page=1,token,imported=0,skipped=0;
 for(let n=0;n<maxPages;n++){const result=await fetchPage({since,page,token});for(const lead of result.data||[]){const outcome=await onLead(lead);if(outcome==='imported')imported++;else if(outcome==='skipped')skipped++;}
 if(!result.info?.more_records)return {checkpoint:now,imported,skipped};
 token=result.info.next_page_token;if(token)page=undefined;else if(page&&page<10)page++;else throw Error('Zoho pagination cursor missing');
 }throw Error('Sync page limit reached; checkpoint retained');
}

// Custom REST function mode: fixed window, keyset pagination, add-only caller.
export async function fetchFunctionIncremental({callFunction,checkpoint,onLead,maxPages=500,overlapSeconds=120,windowEnd=''}){
 const last_sync_time=new Date(Date.parse(checkpoint)-overlapSeconds*1000).toISOString().replace(/\.\d{3}Z$/,'Z');let sync_until=windowEnd,after_id='',imported=0,skipped=0;
 for(let page=0;page<maxPages;page++){
  const result=await callFunction({last_sync_time,sync_until,after_id});
  if(result.error)throw Error(result.error);if(!Array.isArray(result.data)||!Number.isFinite(Date.parse(result.sync_until)))throw Error('Incomplete CRM function response');
  if(sync_until&&result.sync_until!==sync_until)throw Error('CRM function changed the sync window');sync_until=result.sync_until;
  for(const lead of result.data){const outcome=await onLead(lead);if(outcome==='imported')imported++;else if(outcome==='skipped')skipped++;}
  if(result.more_records===false)return {checkpoint:sync_until,imported,skipped};
  if(result.more_records!==true||!/^\d+$/.test(result.next_after_id||'')||(after_id&&BigInt(result.next_after_id)<=BigInt(after_id)))throw Error('Invalid CRM function pagination cursor');after_id=result.next_after_id;
 }throw Error('Sync page limit reached; checkpoint retained');
}
