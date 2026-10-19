import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
const compiled=buildSync({entryPoints:['lib/transition-tasks.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {linkedOpenTasks,taskDecisionErrors,transitionTaskState}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].contents).toString('base64'));
import {followUpDate} from '../lib/model.ts';
const record={id:'lead',module:'enquiries',data:{status:'Connected',nextFollowUp:'2026-10-14',followUpAction:'Call customer',followUpTime:'10:00',followUpStatus:'Pending'}};
const next={status:'Discovery completed',followUpNeeded:'No',taskDisposition:'Keep',latestStageNote:'Discovery complete'};
test('keeping a current task preserves its date, time and action through a stage change',()=>{const result=transitionTaskState(record,next,false,'2026-10-13T10:00:00Z');assert.equal(result.followUpStatus,'Pending');assert.equal(result.nextFollowUp,'2026-10-14');assert.equal(result.followUpAction,'Call customer');assert.equal(result.followUpTime,'10:00');});
test('closing a task records completion, removes it from the queue and allows a new next action',()=>{
 const closed=transitionTaskState(record,{...next,taskDisposition:'Close'},false,'2026-10-13T10:00:00Z');assert.equal(closed.followUpStatus,'Completed');assert.equal(closed.followUpCompletionNote,'Discovery complete');assert.equal(followUpDate({...record,data:closed}),'');
 const replacement=transitionTaskState(record,{...next,taskDisposition:'Close',followUpNeeded:'Yes',nextFollowUp:'2026-10-16',followUpAction:'Review proposal'},false,'now');assert.equal(replacement.followUpStatus,'Pending');assert.equal(replacement.followUpAction,'Review proposal');
});
test('keeping an existing task on a closed lead does not silently hide it',()=>{const result=transitionTaskState(record,{...next,status:'Disqualified'},true,'now');assert.equal(followUpDate({...record,data:result}),'2026-10-14');});
test('new discovery meetings remain pending when the earlier task is closed',()=>{const result=transitionTaskState(record,{...next,status:'Discovery scheduled',discoveryDate:'2026-10-20',taskDisposition:'Close'},false,'now');assert.equal(result.followUpStatus,'Pending');assert.equal(followUpDate({...record,data:result}),'2026-10-20');});
test('only pending linked activities require a decision and unrelated tasks stay separate',()=>{
 const activity=(id,status,link,followUpStatus='Pending')=>({id,module:'activities',data:{status,enquiryId:link,followUpStatus}});
 const linked=linkedOpenTasks(record,[activity('open','Scheduled','lead'),activity('done','Completed','lead'),activity('followup-done','Scheduled','lead','Completed'),activity('other','Scheduled','other')]);assert.deepEqual(linked.map(t=>t.id),['open']);assert.ok(taskDecisionErrors(record,linked,'').length);assert.deepEqual(taskDecisionErrors(record,linked,'Keep'),[]);assert.deepEqual(taskDecisionErrors({module:'enquiries',data:{status:'New Lead'}},[],''),[]);
});

test('a kept follow-up can be rescheduled without completing it',()=>{const result=transitionTaskState(record,{...next,followUpNeeded:'Yes',nextFollowUp:'2026-10-20',followUpTime:'15:30',followUpAction:'Present the solution'},false,'now');assert.equal(result.nextFollowUp,'2026-10-20');assert.equal(result.followUpTime,'15:30');assert.equal(result.followUpAction,'Present the solution');assert.equal(result.followUpStatus,'Pending');assert.equal(result.followUpCompletedAt,'');});
