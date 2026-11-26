import {followUpLabel,indiaToday,type CRMRecord} from './model.ts';
export const leadViewNames=['Active Leads','Archived / Converted','Lost / Disqualified','All Leads'];
export type LeadCriteria={view:string;ownerScope:string;stage:string;source:string;owner:string;followup:string;company:string;zohoCRMId:string;createdWhen:string;fromDate:string;fromTime:string;toDate:string;toTime:string};
export type LeadView={id:string;name:string;criteria:LeadCriteria;search:string};
export const emptyLeadCriteria=():LeadCriteria=>({view:'Active Leads',ownerScope:'mine',stage:'',source:'',owner:'',followup:'',company:'',zohoCRMId:'',createdWhen:'',fromDate:'',fromTime:'',toDate:'',toTime:''});
export function normalizeLeadCriteria(value:Partial<LeadCriteria>={}):LeadCriteria{
 const criteria={...emptyLeadCriteria(),...value};
 if(!criteria.createdWhen)criteria.createdWhen=criteria.fromDate&&criteria.toDate?'between':criteria.fromDate?'after':criteria.toDate?'before':'';
 if(!value.ownerScope)criteria.ownerScope=criteria.owner||'mine';
 return criteria;
}
export function matchesLead(r:CRMRecord,c:LeadCriteria,today=indiaToday()){
 const converted=r.data.status==='Converted'||!!r.data.convertedOpportunityId,lost=['Lead Lost','Disqualified','Junk Lead','Not qualified'].includes(r.data.status);
 if(c.view==='Active Leads'&&(converted||lost)||c.view==='Archived / Converted'&&!converted||c.view==='Lost / Disqualified'&&!lost)return false;
 if(c.stage&&r.data.status!==c.stage||c.source&&r.data.source!==c.source||c.owner&&r.ownerId!==c.owner||c.followup&&followUpLabel(r,today)!==c.followup||c.company&&!r.data.companyName?.toLowerCase().includes(c.company.toLowerCase())||c.zohoCRMId&&!r.data.zohoCRMId?.includes(c.zohoCRMId.trim()))return false;
 const created=Date.parse(r.createdAt);if(c.fromDate&&created<Date.parse(c.fromDate+'T'+(c.fromTime||'00:00')+':00+05:30')||c.toDate&&created>Date.parse(c.toDate+'T'+(c.toTime||'23:59')+':59+05:30'))return false;return true;
}
