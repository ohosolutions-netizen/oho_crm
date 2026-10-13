import {test} from 'node:test';
import assert from 'node:assert/strict';
import {stageErrors,followUpErrors} from '../lib/stage-rules.ts';
import {followUpDate,followUpLabel,followUpAction,followUpTime} from '../lib/model.ts';
test('not connected requires outreach outcome, note, and a dated next action',()=>{
  const missing=stageErrors('enquiries','Not connected',{followUpNeeded:'No'});
  assert.ok(missing.some(s=>s.includes('outcome')));assert.ok(missing.some(s=>s.includes('note')));assert.ok(missing.some(s=>s.includes('Schedule')));
  assert.deepEqual(stageErrors('enquiries','Not connected',{contactMethod:'Call',contactDate:'2026-10-13',contactOutcome:'No answer',stageNote:'Could not reach contact',followUpNeeded:'Yes',nextFollowUp:'2026-10-14',followUpAction:'Call again at the requested time'}),[]);
});
test('discovery scheduling requires date, time, meeting mode and location',()=>{
  const base={stageNote:'Customer agreed to meet',followUpNeeded:'No',discoveryDate:'2026-10-14'};
  const errors=stageErrors('enquiries','Discovery scheduled',base);assert.ok(errors.some(s=>s.includes('time')));assert.ok(errors.some(s=>s.includes('mode')));assert.ok(errors.some(s=>s.includes('location')));
  assert.deepEqual(stageErrors('enquiries','Discovery scheduled',{...base,discoveryTime:'10:30',discoveryMode:'Offline',discoveryLocation:'Customer office'}),[]);
});
test('commercial stages capture proposal, negotiation, acceptance and lost information',()=>{
  assert.ok(stageErrors('opportunities','Proposal sent',{stageNote:'Sent',followUpNeeded:'No'}).some(s=>s.includes('reference')));
  assert.ok(stageErrors('opportunities','Negotiation',{stageNote:'Discussed',followUpNeeded:'No'}).some(s=>s.includes('points')));
  assert.ok(stageErrors('opportunities','Accepted',{stageNote:'Agreed'}).some(s=>s.includes('Accepted by')));
  assert.ok(stageErrors('opportunities','Closed lost',{stageNote:'Lost'}).some(s=>s.includes('Reason lost')));
  assert.deepEqual(stageErrors('opportunities','Accepted',{stageNote:'Customer accepted',acceptedDate:'2026-10-13',acceptedBy:'Anika',amount:'125000'}),[]);
});
test('follow-up classification is consistent between dashboard and list',()=>{
  const record={module:'enquiries',data:{status:'Connected',nextFollowUp:'2026-10-13',followUpAction:'Confirm proposal scope',followUpStatus:'Pending'}};
  assert.equal(followUpLabel(record,'2026-10-14'),'Overdue');assert.equal(followUpLabel(record,'2026-10-13'),'Due today');assert.equal(followUpLabel(record,'2026-10-12'),'Upcoming');assert.equal(followUpAction(record),'Confirm proposal scope');
  const completed={...record,data:{...record.data,followUpStatus:'Completed'}};assert.equal(followUpDate(completed),'');assert.equal(followUpLabel(completed,'2026-10-14'),'Completed');
  assert.equal(followUpLabel({...record,data:{status:'Connected'}},'2026-10-14'),'No follow-up');
  assert.equal(followUpDate({module:'opportunities',data:{stage:'Proposal preparation',proposalDueDate:'2026-10-15'}}),'2026-10-15');
});
test('follow-up input validates real dates, times and action text',()=>{
  assert.ok(followUpErrors({nextFollowUp:'2026-02-30',followUpTime:'28:00'}).length>=3);
  assert.deepEqual(followUpErrors({nextFollowUp:'2026-10-14',followUpTime:'14:30',followUpAction:'Call the customer'}),[]);
});
test('discovery and activity reminders retain meeting time without reusing it for a different follow-up date',()=>{
  assert.equal(followUpTime({module:'enquiries',data:{status:'Discovery scheduled',discoveryDate:'2026-10-14',discoveryTime:'10:30'}}),'10:30');
  assert.equal(followUpTime({module:'activities',data:{dueDate:'2026-10-14',time:'11:00'}}),'11:00');
  assert.equal(followUpTime({module:'activities',data:{dueDate:'2026-10-14',time:'11:00',nextFollowUp:'2026-10-15'}}),'');
  assert.equal(followUpTime({module:'enquiries',data:{status:'Connected',nextFollowUp:'2026-10-15',followUpTime:'14:30'}}),'14:30');
});
