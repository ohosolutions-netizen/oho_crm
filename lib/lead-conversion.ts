import type {CRMRecord} from './model';
import type {StageEvent} from './stage-rules';
const steps=[{label:'New leads',stages:[]},{label:'Connected',stages:['Connected','Not Pitched','Discovery scheduled','Discovery completed','Converted']},{label:'Discovery scheduled',stages:['Discovery scheduled','Discovery completed','Converted']},{label:'Discovery completed',stages:['Discovery completed','Converted']},{label:'Converted',stages:['Converted']}];
export function leadConversion(records:CRMRecord[],events:StageEvent[],from:string,to:string){
 const leads=records.filter(r=>r.module==='enquiries'&&(()=>{const value=r.createdAt;const day=value.length===10?value:new Date(value).toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});return day>=from&&day<=to;})());
 const history=new Map<string,Set<string>>();for(const e of events){let reached=history.get(e.recordId);if(!reached){reached=new Set();history.set(e.recordId,reached);}reached.add(e.toStage);reached.add(e.fromStage);}
 const opportunities=records.filter(r=>r.module==='opportunities');
 const linked=new Map<string,CRMRecord[]>();for(const r of opportunities){const id=r.data.enquiryId||leads.find(l=>l.data.convertedOpportunityId===r.id)?.id;if(id)linked.set(id,[...(linked.get(id)||[]),r]);}
 const result=steps.map((s,i)=>{const count=i===0?leads.length:leads.filter(r=>s.stages.includes(r.data.status)||s.stages.some(stage=>history.get(r.id)?.has(stage))).length;return {label:s.label,count,percent:leads.length?Math.round(count/leads.length*100):0};});
 const stages=['Solution planning','Proposal preparation','Proposal sent','Negotiation','Accepted'];
 for(let i=0;i<stages.length;i++){const reached=stages.slice(i);const count=leads.filter(l=>(linked.get(l.id)||[]).some(o=>reached.includes(o.data.stage)||reached.some(s=>history.get(o.id)?.has(s)))).length;result.push({label:stages[i]==='Accepted'?'Proposal accepted':stages[i],count,percent:leads.length?Math.round(count/leads.length*100):0});}
 return result;
}
