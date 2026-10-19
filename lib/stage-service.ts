import {stageMoveAllowed} from './stage-path';
import { database, APIError, allRecords, canSee, permit, rows, type Context } from './server';
import {acceptedRevision,nextProposalVersion,documentUrl} from './proposal-revisions';
import { stageRules, stageOf, stageErrors, followUpErrors, type StageEvent } from './stage-rules';
import { followUpDate, followUpAction, followUpTime, dateTimeKey, type CRMRecord } from './model';
import {linkedOpenTasks,taskDecisionErrors,transitionTaskState} from './transition-tasks';
function clean(input:unknown):Record<string,string>{if(!input||typeof input!=='object'||Array.isArray(input))throw new APIError('Enter the required details.');const data:Record<string,string>={};for(const [key,value]of Object.entries(input)){if(typeof value!=='string'||value.length>10000)throw new APIError('Enter valid details.');data[key]=value.trim();}return data;}
async function find(c:Context,id:unknown){const r=(await allRecords('id=?',[id])).find(r=>r.id===id);if(!r||!canSee(c,r))throw new APIError('Record unavailable.',404);permit(c,r.module,'edit');if(r.module==='enquiries'&&r.data.status==='Converted')throw new APIError('Manage follow-ups on the converted opportunity.');return r;}
async function commit(c:Context,r:CRMRecord,data:Record<string,string>,action:string,details:unknown,expected:unknown,closedTasks:CRMRecord[]=[],meeting?:Record<string,string>,proposal?:{record:CRMRecord;create:boolean;uploadId?:string;upload?:Record<string,unknown>}){
  if(expected!==r.updatedAt)throw new APIError('This record changed. Refresh it before saving.',409);
  const now=new Date(Math.max(Date.now(),Date.parse(r.updatedAt)+1)).toISOString();
  const guard=closedTasks.map(()=> ' AND EXISTS (SELECT 1 FROM records WHERE id=? AND updated_at=?)').join('');
  const versions=closedTasks.flatMap(t=>[t.id,t.updatedAt]);
  const extras:D1PreparedStatement[]=[];
  if(proposal){
    const p=proposal.record;
    if(proposal.create)extras.push(database().prepare('INSERT INTO records (id,module,title,owner_id,company_id,data,created_at,updated_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM records WHERE id=? AND updated_at=?)').bind(p.id,'proposals',p.title,p.ownerId,p.companyId,JSON.stringify(p.data),now,now,r.id,now));
    else extras.push(database().prepare('UPDATE records SET data=?,updated_at=? WHERE id=? AND updated_at=? AND EXISTS (SELECT 1 FROM records WHERE id=? AND updated_at=?)').bind(JSON.stringify(p.data),now,p.id,p.updatedAt,r.id,now));
    extras.push(database().prepare('INSERT INTO audit (id,actor_id,action,target,details,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM records WHERE id=? AND updated_at=?)').bind(crypto.randomUUID(),c.me.id,proposal.create?'create':'accept','record:'+p.id,JSON.stringify({module:'proposals',title:p.title,data:p.data}),now,r.id,now));
    if(proposal.uploadId)extras.push(database().prepare('UPDATE settings SET value=? WHERE key=? AND EXISTS (SELECT 1 FROM records WHERE id=? AND updated_at=?)').bind(JSON.stringify({...proposal.upload,proposalId:p.id}),'proposal-upload:'+proposal.uploadId,r.id,now));
  }
  if(meeting){
    const id=crypto.randomUUID(),title=`Discovery meeting · ${r.title}`;data.discoveryActivityId=id;
    extras.push(database().prepare('INSERT INTO records (id,module,title,owner_id,company_id,data,created_at,updated_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM records WHERE id=? AND updated_at=?)').bind(id,'activities',title,r.ownerId,r.companyId,JSON.stringify(meeting),now,now,r.id,now));
    extras.push(database().prepare('INSERT INTO audit (id,actor_id,action,target,details,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM records WHERE id=? AND updated_at=?)').bind(crypto.randomUUID(),c.me.id,'create','record:'+id,JSON.stringify({module:'activities',title,data:meeting}),now,r.id,now));
  }
  for(const t of closedTasks){const after={...t.data,status:'Completed',outcome:'Completed',followUpStatus:'Completed',followUpCompletedAt:now,followUpCompletionNote:data.latestStageNote};
    extras.push(database().prepare('UPDATE records SET data=?,updated_at=? WHERE id=? AND updated_at=? AND EXISTS (SELECT 1 FROM records WHERE id=? AND updated_at=?)').bind(JSON.stringify(after),now,t.id,t.updatedAt,r.id,now));
    extras.push(database().prepare('INSERT INTO audit (id,actor_id,action,target,details,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM records WHERE id=? AND updated_at=?)').bind(crypto.randomUUID(),c.me.id,'followup','record:'+t.id,JSON.stringify({action:'complete',before:t.data,after,closedWithRecord:r.id}),now,t.id,now));
  }
  const result=await database().batch([
    database().prepare('INSERT INTO audit (id,actor_id,action,target,details,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM records WHERE id=? AND updated_at=?)'+guard).bind(crypto.randomUUID(),c.me.id,action,'record:'+r.id,JSON.stringify(details),now,r.id,r.updatedAt,...versions),
    database().prepare('UPDATE records SET data=?,updated_at=? WHERE id=? AND updated_at=?'+guard).bind(JSON.stringify(data),now,r.id,r.updatedAt,...versions),
    ...extras,
  ]);
  if(!result[1].meta.changes)throw new APIError('This record changed. Refresh it before saving.',409);
  return Response.json({ok:true,id:r.id},{headers:{'Cache-Control':'no-store'}});
}
export async function transition(c:Context,b:Record<string,unknown>){
  const r=await find(c,b.id);const target=typeof b.targetStage==='string'?b.targetStage:'';const rule=stageRules[r.module]?.[target];if(!rule)throw new APIError('Select a valid stage.');if(!stageMoveAllowed(r.module,stageOf(r),target))throw new APIError('This stage is not available from the current stage.',409);
  const input=clean(b.data);const captured:Record<string,string>={};
  const records=await allRecords("module IN ('activities','proposals')");
  let proposal:{record:CRMRecord;create:boolean;uploadId?:string;upload?:Record<string,unknown>}|undefined;
  if(r.module==='opportunities'&&target==='Proposal sent'){
    permit(c,'proposals','create');
    if(!r.companyId)throw new APIError('Link a company before sending a proposal.');
    if(!input.proposalDocumentId)throw new APIError('Upload the proposal document before marking it sent.');
    const row=(await rows<{value:string}>('SELECT value FROM settings WHERE key=?','proposal-upload:'+input.proposalDocumentId))[0];
    if(!row)throw new APIError('Upload a valid proposal document.');
    const doc=JSON.parse(row.value);
    if(doc.opportunityId!==r.id||doc.actorId!==c.me.id||doc.proposalId)throw new APIError('Upload a new document for this proposal revision.');
    const version=nextProposalVersion(r.id,records),id=crypto.randomUUID(),now=new Date().toISOString();
    proposal={create:true,uploadId:doc.id,upload:doc,record:{id,module:'proposals',title:`${input.proposalReference||r.title} · v${version}`,companyId:r.companyId,ownerId:r.ownerId,createdAt:now,updatedAt:now,data:{opportunityId:r.id,version,amount:input.amount,status:'Sent',sentDate:input.proposalSentDate,sentTime:input.proposalSentTime||'',sentTo:input.proposalSentTo,documentId:doc.id,documentName:doc.name,documentUrl:documentUrl(doc.id),notes:input.proposalNote,currency:input.currency||r.data.currency||'INR',acceptedDate:'',acceptedBy:'',acceptanceUrl:''}}};
    input.proposalDocumentUrl=documentUrl(doc.id);input.proposalId=id;input.proposalVersion=version;input.proposalDocumentName=doc.name;
  }
  if(r.module==='opportunities'&&target==='Accepted'){
    permit(c,'proposals','edit');
    const p=acceptedRevision(r.id,input.acceptedProposalId,records);
    if(!p||!canSee(c,p))throw new APIError('Select a sent proposal revision belonging to this opportunity.');
    if(p.data.status==='Accepted')throw new APIError('This accepted proposal revision is retained and cannot be changed.');
    if(records.some(x=>x.module==='proposals'&&x.data.opportunityId===r.id&&x.data.status==='Accepted'&&x.id!==p.id))throw new APIError('An accepted revision is already retained for this opportunity.');
    if(input.acceptedProposalUpdatedAt!==p.updatedAt)throw new APIError('This proposal changed. Refresh before accepting it.',409);
    proposal={create:false,record:{...p,data:{...p.data,status:'Accepted',acceptedDate:input.acceptedDate,acceptedTime:input.acceptedTime||'',acceptedBy:input.acceptedBy,acceptedAmount:input.amount,acceptedCurrency:input.currency||p.data.currency||'INR',advanceAmount:input.advanceAmount,paidDate:input.paidDate,paidTime:input.paidTime||'',acceptanceUrl:input.acceptanceReference||''}}};
    input.acceptedProposalVersion=p.data.version;input.acceptedProposalName=p.title;
  }
  if(r.module==='enquiries'&&rule.fields.some(f=>f.key==='contactDate')){
    const now=new Date();
    input.contactDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
    input.contactTime=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);
  }
  const tasks=linkedOpenTasks(r,records).filter(t=>canSee(c,t));
  const choice=input.taskDisposition||'';const decisionErrors=taskDecisionErrors(r,tasks,choice);if(decisionErrors.length)throw new APIError(decisionErrors.join(' '));
  let expectedTasks:unknown;try{expectedTasks=JSON.parse(input.linkedTaskVersions||'[]');}catch{throw new APIError('Refresh the current tasks before saving.',409);}
  if(tasks.length&&(!Array.isArray(expectedTasks)||tasks.some(t=>!expectedTasks.some(v=>v?.id===t.id&&v?.updatedAt===t.updatedAt))||expectedTasks.length!==tasks.length))throw new APIError('The current tasks changed. Refresh before saving.',409);
  let selected:string[]=[];if(input.closedTaskIds!==undefined){try{selected=JSON.parse(input.closedTaskIds);if(!Array.isArray(selected)||selected.some(id=>typeof id!=='string'||!tasks.some(t=>t.id===id)))throw new Error();}catch{throw new APIError('Choose valid pending tasks to close.');}}
  const closedTasks=input.closedTaskIds!==undefined?tasks.filter(t=>selected.includes(t.id)):choice==='Close'?tasks:[];if(closedTasks.length)permit(c,'activities','edit');
  for(const key of [...rule.fields.map(f=>f.key),'stageNote','followUpNeeded','nextFollowUp','followUpAction','followUpTime','taskDisposition'])captured[key]=input[key]||'';
  if(r.module==='enquiries'&&['Disqualified','Junk Lead','Lead Lost'].includes(target))captured.notInterestedReason=captured.disqualificationReason;
  captured.currency=input.currency||r.data.currency||'INR';
  if(target==='Accepted'&&Number(input.advanceAmount)>Number(input.amount))throw new APIError('Advance amount cannot exceed the agreed amount.');
  if(proposal)for(const key of ['proposalId','proposalVersion','proposalDocumentId','proposalDocumentName','proposalDocumentUrl','acceptedProposalVersion','acceptedProposalName'])if(input[key])captured[key]=input[key];
  for(const field of rule.fields.filter(f=>f.type==='date')){const key=dateTimeKey(field.key,r.module);captured[key]=input[key]||r.data[key]||'';if(captured[key]&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(captured[key]))throw new APIError('Enter a valid time.');}
  if(choice==='Keep'&&followUpDate(r)){captured.followUpNeeded='Yes';if(rule.terminal||input.followUpNeeded!=='Yes'&&!input.nextFollowUp){captured.nextFollowUp=followUpDate(r);captured.followUpAction=followUpAction(r);captured.followUpTime=followUpTime(r);}const followErrors=followUpErrors(captured);if(followErrors.length)throw new APIError(followErrors.join(' '));}
  const errors=stageErrors(r.module,target,captured);if(errors.length)throw new APIError(errors.join(' '));
  const data=transitionTaskState(r,{...r.data,...captured,[r.module==='enquiries'?'status':'stage']:target,latestStageNote:captured.stageNote},!!rule.terminal,new Date().toISOString());
  const taskHistory={...captured,...(followUpDate(r)?{currentTaskDate:followUpDate(r),currentTaskAction:followUpAction(r)}:{}),...(tasks.length?{linkedTasks:tasks.map(t=>t.title).join(', '),closedTasks:closedTasks.map(t=>t.title).join(', '),keptTasks:tasks.filter(t=>!closedTasks.includes(t)).map(t=>t.title).join(', ')}:{})};
  let meeting:Record<string,string>|undefined;
  if(r.module==='enquiries'&&target==='Discovery scheduled'){
    permit(c,'activities','create');
    meeting={enquiryId:r.id,contactId:r.data.contactId||'',opportunityId:'',type:captured.discoveryMode==='Offline'?'Offline meeting':'Online meeting',dueDate:captured.discoveryDate,time:captured.discoveryTime,status:'Scheduled',outcome:'Pending',location:captured.discoveryLocation,notes:captured.stageNote,stageContext:target};
  }
  return commit(c,r,data,'transition',{module:r.module,fromStage:stageOf(r),toStage:target,data:taskHistory},b.expectedUpdatedAt,closedTasks,meeting,proposal);
}
export async function updateFollowUp(c:Context,b:Record<string,unknown>){
  const r=await find(c,b.id);const input=clean(b.data);let data={...r.data};
  if(b.action==='plan'){
    if(['Completed','Cancelled','Paid','Rejected','Disqualified','Junk Lead','Lead Lost'].includes(r.data.status))throw new APIError('Reopen this record before scheduling a follow-up.');
    const captured={nextFollowUp:input.nextFollowUp||'',followUpAction:input.followUpAction||'',followUpTime:input.followUpTime||''};const errors=followUpErrors(captured);if(errors.length)throw new APIError(errors.join(' '));
    data={...data,...captured,followUpNeeded:'Yes',followUpStatus:'Pending',followUpCompletedAt:'',followUpCompletionNote:''};
  }else if(b.action==='complete'||b.action==='cancel'){
    const due=followUpDate(r);if(!due)throw new APIError('This record has no pending follow-up.');
    if(!input.followUpCompletionNote)throw new APIError('Record the follow-up outcome or cancellation reason.');
    data={...data,nextFollowUp:due,followUpAction:followUpAction(r),followUpStatus:b.action==='complete'?'Completed':'Cancelled',followUpCompletedAt:new Date().toISOString(),followUpCompletionNote:input.followUpCompletionNote};
  }else throw new APIError('Unknown follow-up action.');
  return commit(c,r,data,'followup',{action:b.action,before:r.data,after:data},b.expectedUpdatedAt);
}
export async function visibleHistory(c:Context,records:CRMRecord[]):Promise<StageEvent[]>{
  const visible=new Set(records.map(r=>r.id));
  const targets=records.length<=100?records.flatMap(r=>["record:"+r.id,"lead:"+r.id]):[];
  const result=await database().prepare("SELECT id,actor_id,action,target,details,created_at FROM audit WHERE action IN ('transition','convert','followup','note')"+(targets.length?" AND target IN ("+targets.map(()=>"?").join(",")+")":"")+" ORDER BY created_at DESC"+(targets.length?"":" LIMIT 1000")).bind(...targets).all<{id:string;actor_id:string;action:string;target:string;details:string;created_at:string}>();
  return result.results.flatMap(a=>{const recordId=a.target.replace(/^(record|lead):/,'');if(!visible.has(recordId))return [];const d=JSON.parse(a.details);const followup=a.action==='followup';return [{id:a.id,recordId,actor:c.members.find(u=>u.id===a.actor_id)?.name||'Team member',fromStage:a.action==='note'?'Note':followup?'Follow-up':d.fromStage||d.before?.data?.status||'',toStage:a.action==='note'?'Note added':followup?d.action==='plan'?'Planned':d.action==='complete'?'Completed':'Cancelled':d.toStage||(a.action==='convert'?'Converted':''),data:followup?{stageNote:d.after.followUpCompletionNote||d.after.followUpAction,nextFollowUp:d.after.nextFollowUp,followUpAction:d.after.followUpAction,followUpTime:d.after.followUpTime,followUpStatus:d.after.followUpStatus}:d.data||{stageNote:'Converted to opportunity'},createdAt:a.created_at}];});
}


export async function addNote(c:Context,b:Record<string,unknown>){
 const r=(await allRecords('id=?',[b.id]))[0];if(!r||!canSee(c,r))throw new APIError('Record unavailable.',404);permit(c,r.module,'edit');const input=clean(b.data);if(!input.note)throw new APIError('Enter a note.');const now=new Date().toISOString();
 return commit(c,r,{...r.data,latestNote:input.note},'note',{module:r.module,data:{stageNote:input.note}},b.expectedUpdatedAt);
}
