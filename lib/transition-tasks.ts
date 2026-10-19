import {followUpDate,followUpAction,followUpTime,type CRMRecord} from './model';
export function linkedOpenTasks(record:CRMRecord,records:CRMRecord[]){return records.filter(t=>t.module==='activities'&&t.data.status==='Scheduled'&&!['Completed','Cancelled'].includes(t.data.followUpStatus)&&(t.data.enquiryId===record.id||t.data.opportunityId===record.id));}
export function taskDecisionErrors(record:CRMRecord,tasks:CRMRecord[],choice:string){return (followUpDate(record)||tasks.length)&&!['Close','Keep'].includes(choice)?['Choose whether to close the current task or keep it open.']:[];}
export function transitionTaskState(record:CRMRecord,next:Record<string,string>,terminal:boolean,now:string){
  const due=followUpDate(record),choice=next.taskDisposition;
  if(due&&choice==='Keep')return {...next,nextFollowUp:!terminal&&next.followUpNeeded==='Yes'?next.nextFollowUp:due,followUpAction:!terminal&&next.followUpNeeded==='Yes'?next.followUpAction:followUpAction(record),followUpTime:!terminal&&next.followUpNeeded==='Yes'?next.followUpTime:followUpTime(record),followUpNeeded:'Yes',followUpStatus:'Pending',followUpCompletedAt:'',followUpCompletionNote:''};
  const automaticNewTask=!terminal&&(record.module==='enquiries'&&next.status==='Discovery scheduled'||record.module==='opportunities'&&next.stage==='Proposal preparation');
  if(due&&choice==='Close'&&(terminal||next.followUpNeeded!=='Yes')&&!automaticNewTask)return {...next,nextFollowUp:due,followUpAction:followUpAction(record),followUpTime:followUpTime(record),followUpNeeded:'No',followUpStatus:'Completed',followUpCompletedAt:now,followUpCompletionNote:next.latestStageNote};
  const cleared=terminal||next.followUpNeeded==='No';
  return {...next,...(cleared?{nextFollowUp:'',followUpAction:'',followUpTime:'',followUpNeeded:'No'}:{}),followUpStatus:'Pending',followUpCompletedAt:'',followUpCompletionNote:''};
}
