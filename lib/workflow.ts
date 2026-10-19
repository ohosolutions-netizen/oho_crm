import { APIError, allRecords, canSee, database, log, permit, type Context } from './server';
import { canConvertLead, followUpDate, type CRMRecord } from './model';
function text(value:unknown,fallback='',limit=10000) {if(value==null)return fallback;if(typeof value!=='string'||value.length>limit)throw new APIError('Enter valid conversion details.');return value.trim();}
function date(value:string,label:string) {if(value&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value))throw new APIError(`Enter a valid ${label}.`);return value;}
export async function convertLead(c:Context,b:Record<string,unknown>) {
  permit(c,'enquiries','edit');permit(c,'opportunities','create');
  const records=await allRecords("module<>'enquiries' OR id=?",[b.leadId]);const lead=records.find(r=>r.id===b.leadId&&r.module==='enquiries');
  if(!lead||!canSee(c,lead))throw new APIError('Lead unavailable.',404);
  if(!canConvertLead(lead.data))throw new APIError(lead.data.status==='Converted'?'This lead has already been converted.':'Connect with the lead before converting it to an opportunity.',409);
  if(records.some(r=>r.module==='opportunities'&&r.data.enquiryId===lead.id))throw new APIError('This lead already has a linked opportunity.',409);
  if(!c.members.find(u=>u.id===lead.ownerId)?.active)throw new APIError('Assign an active owner to the lead before converting.');
  const title=text(b.title,lead.title,180);if(!title)throw new APIError('Enter an opportunity name.');
  const companyName=text(b.companyName,lead.data.companyName||'',180);
  let companyId=text(b.companyId,lead.companyId||'');
  const queries:D1PreparedStatement[]=[];const now=new Date().toISOString();
  const id=crypto.randomUUID();
  // The unique key and all resulting records commit in one D1 transaction.
  queries.push(database().prepare('INSERT INTO settings (key,value) VALUES (?,?)').bind('lead_conversion:'+lead.id,id));
  function insert(module:string,recordId:string,recordTitle:string,data:Record<string,string>,parentId:string|null) {
    queries.push(database().prepare('INSERT INTO records (id,module,title,owner_id,company_id,data,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').bind(recordId,module,recordTitle,lead!.ownerId,parentId,JSON.stringify(data),now,now));
  }
  if(companyId){const company=records.find(r=>r.module==='companies'&&r.id===companyId);if(!company||!canSee(c,company))throw new APIError('Select a company you can access.');}
  else {
    if(!companyName)throw new APIError('Select an existing company or enter a company name.');
    const match=records.find(r=>r.module==='companies'&&r.title.toLowerCase()===companyName.toLowerCase());
    if(match){if(!canSee(c,match))throw new APIError('Select a company you can access.');companyId=match.id;}
    else {permit(c,'companies','create');companyId=crypto.randomUUID();insert('companies',companyId,companyName,{status:'Prospect'},null);}
  }
  let contactId=text(b.contactId,lead.data.contactId||'');
  const contactName=text(b.contactName,lead.data.contactName||'',180);
  const email=text(b.email,lead.data.email||'').toLowerCase(),phone=text(b.phone,lead.data.phone||'');
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new APIError('Enter a valid contact email.');
  if(contactId){const contact=records.find(r=>r.id===contactId&&r.module==='contacts');if(!contact||!canSee(c,contact)||contact.companyId!==companyId)throw new APIError('Select a contact for the chosen company.');}
  else if(contactName){
    const match=records.find(r=>r.module==='contacts'&&r.companyId===companyId&&(email?r.data.email?.toLowerCase()===email:r.title.toLowerCase()===contactName.toLowerCase()));
    if(match){if(!canSee(c,match))throw new APIError('Select a contact you can access.');contactId=match.id;}
    else{permit(c,'contacts','create');contactId=crypto.randomUUID();insert('contacts',contactId,contactName,{email,phone,decisionMaker:'No'},companyId);}
  }
  const amount=text(b.amount,'0');if(!Number.isFinite(Number(amount))||Number(amount)<0)throw new APIError('Estimated value must be a non-negative number.');
  const nextFollowUp=date(text(b.nextFollowUp,followUpDate(lead)),'follow-up date');
  const data:Record<string,string>={enquiryId:lead.id,contactId,stage:'Solution planning',currency:'INR',products:lead.data.products||'',amount:amount||'0',expectedClose:date(text(b.expectedClose),'expected close date'),expectedCloseTime:text(b.expectedCloseTime),nextFollowUp,scope:lead.data.requirements||'',discoverySummary:lead.data.discoverySummary||'',notes:lead.data.discoverySummary||lead.data.notes||'',followUpAction:nextFollowUp?text(b.followUpAction,lead.data.followUpAction||'Follow up on the proposed solution'):'',followUpTime:text(b.followUpTime,lead.data.followUpTime||''),followUpStatus:'Pending',followUpNeeded:nextFollowUp?'Yes':'No'};
  for(const key of ['expectedCloseTime','followUpTime'])if(data[key]&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(data[key]))throw new APIError('Enter a valid time.');
  if(nextFollowUp&&!data.followUpAction)throw new APIError('Describe the opportunity follow-up action.');
  insert('opportunities',id,title,data,companyId);
  const converted={...lead.data,status:'Converted',convertedOpportunityId:id,convertedAt:now};
  queries.push(database().prepare('UPDATE records SET company_id=?,data=?,updated_at=? WHERE id=?').bind(companyId,JSON.stringify(converted),now,lead.id));
  queries.push(await log(c.me.id,'convert','lead:'+lead.id,{before:lead,opportunityId:id,companyId,contactId,after:{...lead,data:converted},data:{stageNote:'Converted to opportunity',opportunityName:title,companyName:companyName||records.find(r=>r.id===companyId)?.title||'',contactName:contactName||records.find(r=>r.id===contactId)?.title||'',amount:data.amount,nextFollowUp:data.nextFollowUp,followUpAction:data.followUpAction}}));
  try{await database().batch(queries);}catch(e){if(e instanceof Error&&/UNIQUE constraint failed: settings.key/.test(e.message))throw new APIError('This lead has already been converted.',409);throw e;}
  return Response.json({ok:true,id,companyId,contactId,leadId:lead.id},{headers:{'Cache-Control':'no-store'}});
}
