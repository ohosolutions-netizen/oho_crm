import { database, APIError, allRecords, canSee, permit, type Context } from './server';
import { stageRules, stageOf, stageErrors, followUpErrors, type StageEvent } from './stage-rules';
import { followUpDate, followUpAction, type CRMRecord } from './model';
function clean(input:unknown):Record<string,string>{if(!input||typeof input!=='object'||Array.isArray(input))throw new APIError('Enter the required details.');const data:Record<string,string>={};for(const [key,value]of Object.entries(input)){if(typeof value!=='string'||value.length>10000)throw new APIError('Enter valid details.');data[key]=value.trim();}return data;}
async function find(c:Context,id:unknown){const r=(await allRecords()).find(r=>r.id===id);if(!r||!canSee(c,r))throw new APIError('Record unavailable.',404);permit(c,r.module,'edit');if(r.module==='enquiries'&&r.data.status==='Converted')throw new APIError('Manage follow-ups on the converted opportunity.');return r;}
async function commit(c:Context,r:CRMRecord,data:Record<string,string>,action:string,details:unknown,expected:unknown){
  if(expected!==r.updatedAt)throw new APIError('This record changed. Refresh it before saving.',409);
  const now=new Date(Math.max(Date.now(),Date.parse(r.updatedAt)+1)).toISOString();
  const result=await database().batch([
    database().prepare('INSERT INTO audit (id,actor_id,action,target,details,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM records WHERE id=? AND updated_at=?)').bind(crypto.randomUUID(),c.me.id,action,'record:'+r.id,JSON.stringify(details),now,r.id,r.updatedAt),
    database().prepare('UPDATE records SET data=?,updated_at=? WHERE id=? AND updated_at=?').bind(JSON.stringify(data),now,r.id,r.updatedAt),
  ]);
  if(!result[1].meta.changes)throw new APIError('This record changed. Refresh it before saving.',409);
  return Response.json({ok:true,id:r.id},{headers:{'Cache-Control':'no-store'}});
}
export async function transition(c:Context,b:Record<string,unknown>){
  const r=await find(c,b.id);const target=typeof b.targetStage==='string'?b.targetStage:'';const rule=stageRules[r.module]?.[target];if(!rule)throw new APIError('Select a valid stage.');
  const input=clean(b.data);const captured:Record<string,string>={};
  for(const key of [...rule.fields.map(f=>f.key),'stageNote','followUpNeeded','nextFollowUp','followUpAction','followUpTime'])captured[key]=input[key]||'';
  const errors=stageErrors(r.module,target,captured);if(errors.length)throw new APIError(errors.join(' '));
  const data={...r.data,...captured,[r.module==='enquiries'?'status':'stage']:target,latestStageNote:captured.stageNote};
  if(rule.terminal||captured.followUpNeeded==='No'){data.nextFollowUp='';data.followUpAction='';data.followUpTime='';data.followUpNeeded='No';}
  data.followUpStatus='Pending';data.followUpCompletedAt='';data.followUpCompletionNote='';
  return commit(c,r,data,'transition',{module:r.module,fromStage:stageOf(r),toStage:target,data:captured},b.expectedUpdatedAt);
}
export async function updateFollowUp(c:Context,b:Record<string,unknown>){
  const r=await find(c,b.id);const input=clean(b.data);let data={...r.data};
  if(b.action==='plan'){
    if(['Completed','Cancelled','Paid','Rejected','Disqualified'].includes(r.data.status))throw new APIError('Reopen this record before scheduling a follow-up.');
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
  const result=await database().prepare("SELECT id,actor_id,action,target,details,created_at FROM audit WHERE action IN ('transition','convert','followup') ORDER BY created_at DESC LIMIT 1000").all<{id:string;actor_id:string;action:string;target:string;details:string;created_at:string}>();
  return result.results.flatMap(a=>{const recordId=a.target.replace(/^(record|lead):/,'');if(!visible.has(recordId))return [];const d=JSON.parse(a.details);const followup=a.action==='followup';return [{id:a.id,recordId,actor:c.members.find(u=>u.id===a.actor_id)?.name||'Team member',fromStage:followup?'Follow-up':d.fromStage||d.before?.data?.status||'',toStage:followup?d.action==='plan'?'Planned':d.action==='complete'?'Completed':'Cancelled':d.toStage||(a.action==='convert'?'Converted':''),data:followup?{stageNote:d.after.followUpCompletionNote||d.after.followUpAction,nextFollowUp:d.after.nextFollowUp,followUpAction:d.after.followUpAction,followUpTime:d.after.followUpTime,followUpStatus:d.after.followUpStatus}:d.data||{stageNote:'Converted to opportunity'},createdAt:a.created_at}];});
}
