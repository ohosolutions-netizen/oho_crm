import type { Field, CRMRecord } from './model';
export type StageRule = { description:string; fields:Field[]; requiresFollowUp?:boolean; terminal?:boolean };
const method:Field={key:'contactMethod',label:'Contact method',options:['Call','Email','WhatsApp','Online meeting','Offline meeting','Other'],required:true};
const contactDate:Field={key:'contactDate',label:'Contact date',type:'date',required:true};
export const stageRules:Record<string,Record<string,StageRule>>={
  enquiries:{
    'Followup Later':{description:'Schedule the next follow-up.',requiresFollowUp:true,fields:[]},
    'New Lead':{description:'Record why the lead is being returned to initial review.',fields:[]},
    'Not Pitched':{description:'Capture the outreach attempt and schedule the next action.',requiresFollowUp:true,fields:[method,contactDate]},
    'Not Contacted':{description:'Record the contact outcome and schedule the next attempt.',requiresFollowUp:true,fields:[method,contactDate,{key:'contactOutcome',label:'Contact outcome',options:['No answer','Disconnected','Busy','Callback requested','Invalid contact details'],required:true}]},
    Connected:{description:'Capture who you spoke with and what the customer needs.',fields:[method,contactDate,{key:'contactName',label:'Person contacted'},{key:'requirements',label:'Customer requirements',type:'textarea',required:true}]},
    'Discovery to be Scheduled':{description:'The customer has been contacted. Record the context and schedule the next action until the discovery meeting is fixed.',requiresFollowUp:true,fields:[method,contactDate]},
    'Discovery scheduled':{description:'Capture the complete meeting arrangements.',fields:[{key:'discoveryDate',label:'Discovery meeting date',type:'date',required:true},{key:'discoveryTime',label:'Discovery time (India)',type:'time',required:true},{key:'discoveryMode',label:'Meeting mode',options:['Online','Offline'],required:true},{key:'discoveryLocation',label:'Meeting link / location',required:true}]},
    'Discovery completed':{description:'Record the findings before planning a solution.',fields:[{key:'discoveryDate',label:'Discovery meeting date',type:'date',required:true},{key:'discoverySummary',label:'Discovery findings',type:'textarea',required:true},{key:'requirements',label:'Confirmed customer requirements',type:'textarea',required:true},{key:'products',label:'Suggested Zoho products / solution'}]},
    Disqualified:{description:'Record why this lead will not proceed.',terminal:true,fields:[{key:'disqualificationReason',label:'Reason For Not Interested',type:'textarea',required:true}]},
  },
  opportunities:{
    'Solution planning':{description:'Capture the proposed solution and its scope.',fields:[{key:'scope',label:'Solution scope',type:'textarea',required:true},{key:'products',label:'Zoho products / solution'}]},
    'Proposal preparation':{description:'Record the scope, estimated amount, and proposal target date.',fields:[{key:'scope',label:'Proposal scope',type:'textarea',required:true},{key:'amount',label:'Estimated amount',type:'number'},{key:'proposalDueDate',label:'Proposal preparation due date',type:'date',required:true}]},
    'Proposal sent':{description:'Capture the proposal reference, amount, and sent date.',fields:[{key:'currency',label:'Currency',options:['INR','AED','USD','SAR','QAR'],required:true},{key:'proposalReference',label:'Proposal reference / version',required:true},{key:'proposalSentDate',label:'Proposal sent date',type:'date',required:true},{key:'proposalSentTo',label:'Sent to (name or email)'},{key:'amount',label:'Proposal amount',type:'number',required:true},{key:'proposalNote',label:'Note',type:'textarea',required:true},{key:'proposalDocumentUrl',label:'Proposal document link',type:'url'}]},
    Negotiation:{description:'Record the discussion, open points, and current commercial amount.',fields:[{key:'negotiationDate',label:'Negotiation date',type:'date',required:true},{key:'negotiationPoints',label:'Negotiation points / open items',type:'textarea',required:true},{key:'amount',label:'Current amount',type:'number',required:true}]},
    Accepted:{description:'Record customer acceptance and the agreed amount.',terminal:true,fields:[{key:'acceptedProposalId',label:'Accepted proposal revision',type:'proposal',required:true},{key:'acceptedDate',label:'Acceptance date',type:'date',required:true},{key:'acceptedBy',label:'Accepted by',required:true},{key:'amount',label:'Agreed amount',type:'number',required:true},{key:'advanceAmount',label:'Advance amount received',type:'number',required:true},{key:'paidDate',label:'Paid date',type:'date',required:true},{key:'currency',label:'Currency',options:['INR','AED','USD','SAR','QAR'],required:true},{key:'acceptanceReference',label:'Acceptance reference / document link'}]},
    'Closed lost':{description:'Record the closure reason and date.',terminal:true,fields:[{key:'closedDate',label:'Closure date',type:'date',required:true},{key:'lossReason',label:'Reason lost',type:'textarea',required:true}]},
  },
};
export function stageOf(record:CRMRecord){return record.module==='enquiries'?record.data.status:record.data.stage;}
export function stageErrors(module:string,target:string,data:Record<string,string>):string[] {
  const rule=stageRules[module]?.[target];if(!rule)return ['Select a valid stage.'];
  const errors:string[]=[];
  if(!data.stageNote?.trim())errors.push('Record a stage update / outcome note.');
  for(const f of rule.fields){const value=data[f.key]||'';if(f.required&&!value.trim())errors.push(`${f.label} is required.`);if(f.options&&value&&!f.options.includes(value))errors.push(`Invalid ${f.label}.`);if(f.type==='date'&&value&&!validDate(value))errors.push(`Enter a valid ${f.label.toLowerCase()}.`);if(f.type==='time'&&value&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))errors.push(`Enter a valid ${f.label.toLowerCase()}.`);if(f.type==='number'&&value&&(!Number.isFinite(Number(value))||Number(value)<0))errors.push(`${f.label} must be a non-negative number.`);if(f.type==='url'&&value){try{if(!['https:','http:'].includes(new URL(value).protocol))throw new Error();}catch{errors.push(`${f.label} must start with https:// or http://.`);}}}
  if(!rule.terminal){if(!['Yes','No'].includes(data.followUpNeeded))errors.push('Choose whether a follow-up is needed.');if(rule.requiresFollowUp&&data.followUpNeeded!=='Yes')errors.push('Schedule a follow-up for this stage.');if(data.followUpNeeded==='Yes')errors.push(...followUpErrors(data));}
  return errors;
}
export function validDate(value:string){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;}
export function followUpErrors(data:Record<string,string>){const errors:string[]=[];if(!data.nextFollowUp||!validDate(data.nextFollowUp))errors.push('Set a valid follow-up date.');if(!data.followUpAction?.trim())errors.push('Describe the follow-up action.');if(data.followUpTime&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(data.followUpTime))errors.push('Enter a valid follow-up time.');return errors;}
export type StageEvent={id:string;recordId:string;actor:string;fromStage:string;toStage:string;data:Record<string,string>;createdAt:string};

for(const stage of ['Junk Lead','Lead Lost'])stageRules.enquiries[stage]={description:'Record why this lead will not proceed.',terminal:true,fields:[{key:'disqualificationReason',label:'Reason For Not Interested',type:'textarea',required:true}]};
