import { CalendarDays } from 'lucide-react';
import { followUpDate, followUpAction, followUpLabel, followUpTime, type CRMRecord } from '../lib/model';
const format=(v:string)=>new Intl.DateTimeFormat('en-IN',{day:'numeric',month:'short',timeZone:'Asia/Kolkata'}).format(new Date(v+'T00:00:00+05:30'));
export default function FollowUpCell({record:r,today,canEdit,plan}:{record:CRMRecord;today:string;canEdit:boolean;plan:()=>void}){
  const active=followUpDate(r),label=followUpLabel(r,today),date=active||(['Completed','Cancelled'].includes(label)?r.data.nextFollowUp:'');
  const action=['Completed','Cancelled'].includes(label)?r.data.followUpCompletionNote||followUpAction(r):followUpAction(r);
  return <div className="followup-cell dense-followup"><div className="followup-summary">{date&&<strong title={date} className={label==='Overdue'?'danger':''}>{format(date)}{followUpTime(r)&&<span className="due-time"> · {followUpTime(r)}</span>}</strong>}<span className={'badge '+(label==='Overdue'?'red':label==='Due today'?'amber':label==='Completed'?'green':'')}>{label}</span>{canEdit&&!['Completed','Cancelled','Paid','Rejected','Disqualified','Converted'].includes(r.data.status)&&<button className="icon-button followup-edit" title={active?'Reschedule follow-up':'Plan follow-up'} onClick={e=>{e.stopPropagation();plan();}} aria-label={`Plan follow-up for ${r.title}`}><CalendarDays size={16}/></button>}</div>{label!=='No follow-up'&&<p title={action}>{action}</p>}</div>;
}
