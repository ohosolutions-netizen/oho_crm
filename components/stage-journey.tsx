'use client';
import {allowedNextStages} from '../lib/stage-path';
import {Check,ArrowRight} from 'lucide-react';
import {leadStages,leadPrimaryStages,leadFollowupStages,stages,type CRMRecord} from '../lib/model';
import type {StageEvent} from '../lib/stage-rules';
import {stageColor} from '../lib/stage-colors';
export default function StageJourney({record:r,events,editable,canConvert,choose,convert,openOpportunity}:{record:CRMRecord;events:StageEvent[];editable:boolean;canConvert:boolean;choose:(stage:string)=>void;convert:()=>void;openOpportunity:()=>void}){
 const lead=r.module==='enquiries',current=lead?r.data.status:r.data.stage,visited=new Set(events.filter(e=>e.recordId===r.id).map(e=>e.toStage)),options=lead?leadStages:stages;
 const main=lead?leadPrimaryStages:options.filter(s=>s!=='Closed lost'),secondary=lead?leadFollowupStages:[],alternate=options.filter(s=>!main.includes(s)&&!secondary.includes(s)),converted=lead&&current==='Converted';
 function step(s:string,number?:number){const active=s===current,seen=visited.has(s)&&!active,disabled=active||!allowedNextStages(r.module,current).includes(s)||converted||!editable||(s==='Converted'&&!canConvert);return <button key={s} className={'journey-step '+stageColor(s)+(active?' current':'')+(seen?' visited':'')} aria-current={active?'step':undefined} disabled={disabled} aria-label={s+(active?' — current stage':'')} onClick={()=>s==='Converted'?convert():choose(s)}><span className="journey-label-text">{number&&<span className="journey-step-number">{seen?<Check size={12} aria-label="Previously reached"/>:number}</span>}<span>{s}</span></span></button>;}
 return <section className={"detail-section journey-section "+(lead?"lead-journey":"opportunity-journey")}><div className="card-heading compact"><h3>{lead?'Lead journey':'Opportunity journey'}</h3><span className="journey-current">{current==='Connected'?'Previous stage':current}</span></div><div className="journey-scroll"><div className="journey-track">{main.map((s,index)=>step(s,index+1))}</div></div>{lead&&<div className="journey-secondary"><span className="journey-secondary-label">Follow-up stages</span><div className="journey-track">{secondary.map((s,index)=>step(s,index+1))}</div></div>}<div className="journey-secondary journey-outcomes"><span className="journey-secondary-label">Other outcomes</span><div className="journey-track">{alternate.map(s=>step(s))}</div></div>{converted&&<button className="text-button" onClick={openOpportunity}>Open opportunity<ArrowRight size={16}/></button>}</section>;
}

