import { CalendarDays } from 'lucide-react';
import { followUpDate, followUpAction, followUpLabel, followUpTime, type CRMRecord } from '../lib/model';
const format=(v:string)=>new Intl.DateTimeFormat('en-IN',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Kolkata'}).format(new Date(v+'T00:00:00+05:30'));
export default function FollowUpCell({record:r,today,canEdit,plan}:{record:CRMRecord;today:string;canEdit:boolean;plan:()=>void}){
  const active=followUpDate(r),label=followUpLabel(r,today),date=active||(['Completed','Cancelled'].includes(label)?r.data.nextFollowUp:'');
  return <div className="followup-cell">{date&&<strong className={label==='Overdue'?'danger':''}>{format(date)}{followUpTime(r)&&<small className="block">{followUpTime(r)} IST</small>}</strong>}<span className={'badge '+(label==='Overdue'?'red':label==='Due today'?'amber':label==='Completed'?'green':'')}>{label}</span>{label!=='No follow-up'&&<p>{label==='Completed'||label==='Cancelled'?r.data.followUpCompletionNote||followUpAction(r):followUpAction(r)}</p>}{canEdit&&!['Completed','Cancelled','Paid','Rejected','Disqualified','Converted'].includes(r.data.status)&&<button className="text-button" onClick={plan} aria-label={`Plan follow-up for ${r.title}`}><CalendarDays size={15}/>{active?'Reschedule':'Plan follow-up'}</button>}</div>;
}
