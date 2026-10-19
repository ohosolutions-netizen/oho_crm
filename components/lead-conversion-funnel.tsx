import StageTiming from './stage-timing';
import {useMemo,useState} from 'react';

import {indiaToday,type CRMRecord} from '../lib/model';

import type {StageEvent} from '../lib/stage-rules';

import {leadConversion} from '../lib/lead-conversion';

export default function LeadConversionFunnel({records,events}:{records:CRMRecord[];events:StageEvent[]}){

 const today=indiaToday(),month=today.slice(0,7)+'-01';const [from,setFrom]=useState(month),[to,setTo]=useState(today),[applied,setApplied]=useState({from:month,to:today});

 const values=useMemo(()=>leadConversion(records,events,applied.from,applied.to),[records,events,applied.from,applied.to]);const invalid=!from||!to||from>to;

 return <section className="card conversion-card"><div className="card-heading"><div><h2>Lead conversion matrix</h2><p>Leads received in this period · progress to date</p></div><div className="conversion-dates"><button className="text-button" onClick={()=>{setFrom(month);setTo(today);}}>This month</button><label>From<input aria-label="Lead conversion from date" type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>To<input aria-label="Lead conversion to date" type="date" value={to} onChange={e=>setTo(e.target.value)}/></label><button className="primary" disabled={invalid} onClick={()=>setApplied({from,to})}>Apply</button></div></div>{invalid?<p role="alert" className="subtle">Choose a valid date range.</p>:<><div className="conversion-funnel">{values.map((v,i)=><div key={v.label} className={'conversion-step conversion-step-'+i}><span>{v.label}</span><strong>{v.count.toLocaleString('en-IN')}</strong><small>{v.percent}%</small></div>)}</div><p className="conversion-caption">Percentages of new leads in the selected period. Opportunity stages count linked leads once. Imported deals without a linked lead are excluded. Includes recorded history and progress implied by the current stage.</p><StageTiming from={applied.from} to={applied.to}/></>}</section>;

}

