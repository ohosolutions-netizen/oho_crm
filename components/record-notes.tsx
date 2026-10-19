import {noteText} from '../lib/note-text';
import {ChevronRight,MessageSquare,CalendarDays} from 'lucide-react';
import {stageColor} from '../lib/stage-colors';
import type {CRMRecord} from '../lib/model';
import type {StageEvent} from '../lib/stage-rules';
const keys:Record<string,string>={latestNote:'Note',notes:'Notes',discoverySummary:'Discovery findings',stageNote:'Stage note',followUpAction:'Follow-up action',followUpCompletionNote:'Follow-up outcome',disqualificationReason:'Disqualification reason',lossReason:'Closure reason',negotiationPoints:'Negotiation points'};
export default function RecordNotes({record,events}:{record:CRMRecord;events:StageEvent[]}){
 const entries=events.flatMap(e=>{const seen=new Set<string>();return Object.entries(keys).flatMap(([key,label])=>{const text=e.data[key]?.trim();if(!text||seen.has(text))return [];seen.add(text);return [{id:e.id+key,text,label:e.toStage==='Migrated note'?(e.data.noteTitle||'Migrated note'):label,stage:e.toStage,actor:e.toStage==='Migrated note'?'Created by '+e.actor:e.actor,date:e.createdAt}];});});
 for(const [key,label]of Object.entries({...keys,latestStageNote:'Latest stage note'})){const text=record.data[key]?.trim();if(text&&!entries.some(e=>e.text===text))entries.push({id:'current-'+key,text,label,stage:'',actor:'',date:record.updatedAt});}
 entries.sort((a,b)=>b.date.localeCompare(a.date));
 return <details className="detail-section story-panel" open><summary><ChevronRight size={16} className="story-chevron"/><span>Notes & follow-up timeline</span><span className="badge">{entries.length}</span></summary><div className="story-timeline">{entries.length?entries.map(e=><article key={e.id} className={e.label.includes('Follow-up')?'story-followup':'story-note'}><span className="story-marker">{e.label.includes('Follow-up')?<CalendarDays size={13}/>:<MessageSquare size={13}/>}</span><div className="story-entry"><div className="story-label"><strong>{e.label}</strong>{e.stage&&<span className={'stage-pill '+stageColor(e.stage)}>{e.stage}</span>}</div><time>{new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kolkata'}).format(new Date(e.date))} IST{e.actor?' · '+e.actor:''}</time><p>{noteText(e.text)}</p></div></article>):<p className="subtle">No notes or follow-up actions yet.</p>}</div></details>;
}
