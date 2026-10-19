import assert from 'node:assert/strict';
const origin='https://oho-crm-60091125992.development.catalystserverless.in',base=origin+'/server/ohocrm';
const login=await fetch(base+'/api/identity',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'c8tyvch5hn@privaterelay.appleid.com'})});
const cookie=login.headers.getSetCookie().find(c=>c.startsWith('oho_crm_email='))?.split(';')[0];assert.ok(cookie);
async function api(payload,expected=200){const res=await fetch(base+'/api/crm',{method:payload?'POST':'GET',headers:{cookie,...(payload?{'Content-Type':'application/json',Origin:origin}:{})},body:payload?JSON.stringify(payload):undefined});const body=await res.json();assert.equal(res.status,expected,JSON.stringify(body));return body;}
const original=await api(),ownerId=original.me.id,prefix='Task QA '+crypto.randomUUID().slice(0,8),date='2026-10-14';let lead,activity,secondActivity;
const get=async id=>(await api()).records.find(r=>r.id===id);
const change=async(record,choice,versions=[],expected=200,target='Not Pitched')=>api({kind:'transition',operation:'edit',id:record.id,targetStage:target,expectedUpdatedAt:record.updatedAt,data:{contactMethod:'Call',contactDate:'2026-10-13',stageNote:'Task transition check',followUpNeeded:'No',taskDisposition:choice,linkedTaskVersions:JSON.stringify(versions),disqualificationReason:'Test complete'}},expected);
try{
 lead=(await api({kind:'record',operation:'create',module:'enquiries',title:prefix+' lead',ownerId,data:{status:'New Lead',source:'Other',receivedDate:'2026-10-13',phone:'+919999999999',requirements:'Verify task closure choices',nextFollowUp:date,followUpAction:'Confirm meeting',followUpTime:'10:00'}})).id;
 activity=(await api({kind:'record',operation:'create',module:'activities',title:prefix+' linked task',ownerId,data:{enquiryId:lead,type:'Task',dueDate:date,status:'Scheduled',outcome:'Pending',notes:'Review customer requirements'}})).id;
 let r=await get(lead),t=await get(activity),versions=[{id:t.id,updatedAt:t.updatedAt}];
 await change(r,'',versions,400);assert.equal((await get(lead)).updatedAt,r.updatedAt);console.log('PASS missing task decision cannot change the stage');
 await change(r,'Keep',versions);r=await get(lead);assert.equal(r.data.status,'Not Pitched');assert.equal(r.data.nextFollowUp,date);assert.equal(r.data.followUpStatus,'Pending');assert.equal((await get(activity)).data.status,'Scheduled');console.log('PASS keeping tasks preserves both current follow-up and linked activity');
 await change(r,'Close',[{id:t.id,updatedAt:'stale'}],409);assert.equal((await get(lead)).updatedAt,r.updatedAt);console.log('PASS stale linked task versions reject closure');
 await change(r,'Close',versions);r=await get(lead);t=await get(activity);assert.equal(r.data.followUpStatus,'Completed');assert.equal(t.data.status,'Completed');assert.ok((await api()).stageHistory.some(e=>e.recordId===activity&&e.toStage==='Completed'));console.log('PASS close choice completes both tasks atomically and records outcomes');
 await api({kind:'followup',operation:'edit',id:lead,action:'plan',expectedUpdatedAt:r.updatedAt,data:{nextFollowUp:date,followUpAction:'Send customer closure message'}});r=await get(lead);await change(r,'Keep',[],200,'Disqualified');r=await get(lead);assert.equal(r.data.followUpNeeded,'Yes');assert.equal(r.data.followUpStatus,'Pending');console.log('PASS a kept task survives a terminal stage');
 secondActivity=(await api({kind:'record',operation:'create',module:'activities',title:prefix+' second task',ownerId,data:{enquiryId:lead,type:'Task',dueDate:date,status:'Scheduled',outcome:'Pending',notes:'Another pending task'}})).id;
 await api({kind:'record',operation:'edit',module:'activities',id:activity,title:prefix+' linked task',ownerId,data:{enquiryId:lead,type:'Task',dueDate:date,status:'Scheduled',outcome:'Pending',notes:'Reopened task'}});
 r=await get(lead);t=await get(activity);const second=await get(secondActivity);
 await api({kind:'transition',operation:'edit',id:lead,targetStage:'Junk Lead',expectedUpdatedAt:r.updatedAt,data:{stageNote:'Selected task completed',disqualificationReason:'Duplicate Lead',taskDisposition:'Keep',closedTaskIds:JSON.stringify([activity]),linkedTaskVersions:JSON.stringify([t,second].map(x=>({id:x.id,updatedAt:x.updatedAt})))}});
 assert.equal((await get(activity)).data.status,'Completed');assert.equal((await get(secondActivity)).data.status,'Scheduled');assert.equal((await get(lead)).data.followUpStatus,'Pending');console.log('PASS selected task closes while unchecked activity and lead follow-up remain pending');
 r=await get(lead);await api({kind:'note',operation:'edit',id:lead,expectedUpdatedAt:r.updatedAt,data:{note:'Standalone QA note'}});assert.ok((await api()).stageHistory.some(e=>e.recordId===lead&&e.toStage==='Note added'&&e.data.stageNote==='Standalone QA note'));console.log('PASS independent note saved without changing stage');
 console.log('7 task-transition cloud checks passed.');

}finally{
 if(secondActivity)await api({kind:'record',operation:'delete',module:'activities',id:secondActivity});
 if(activity)await api({kind:'record',operation:'delete',module:'activities',id:activity});
 if(lead)await api({kind:'record',operation:'delete',module:'enquiries',id:lead});
 console.log('Temporary task QA records removed through CRM API.');
}
