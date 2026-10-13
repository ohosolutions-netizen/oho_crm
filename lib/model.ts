export type Action = 'view' | 'create' | 'edit' | 'delete';
export type Role = { id: string; name: string; parentId: string | null };
export type PermissionMap = Record<string, Record<Action, boolean>>;
export type Member = { id: string; name: string; email: string; authId: string | null; roleId: string; profileId: string; active: number };
export type CRMRecord = { id: string; module: string; title: string; ownerId: string; companyId: string | null; data: Record<string, string>; createdAt: string; updatedAt: string };
export type Field = { key: string; label: string; type?: string; options?: string[]; required?: boolean };
export const leadStages = ['New Lead', 'Contacted', 'Not connected', 'Connected', 'Discovery scheduled', 'Discovery completed', 'Converted', 'Disqualified'];
export const stages = ['Solution planning', 'Proposal preparation', 'Proposal sent', 'Negotiation', 'Accepted', 'Closed lost'];
export function normalizeData(module:string,data:Record<string,string>) {
  const copy={...data};
  if(module==='enquiries') {const map:Record<string,string>={New:'New Lead',Reviewing:'Contacted',Qualified:'Discovery completed','Not qualified':'Disqualified'};copy.status=map[copy.status]||copy.status||'New Lead';}
  if(module==='opportunities') {const map:Record<string,string>={'New enquiry':'Solution planning',Qualification:'Solution planning',Discovery:'Solution planning',Proposal:'Proposal sent'};copy.stage=map[copy.stage]||copy.stage||'Solution planning';}
  return copy;
}
export function canConvertLead(data:Record<string,string>) { return ['Connected','Discovery scheduled','Discovery completed'].includes(data.status)&&!data.convertedOpportunityId; }
export const modules: Record<string, { name: string; singular: string; description: string; fields: Field[] }> = {
  companies: { name: 'Companies', singular: 'company', description: 'Your customer relationships, in one place.', fields: [
    { key:'industry',label:'Industry' },{ key:'website',label:'Website',type:'url' },{ key:'email',label:'Company email',type:'email' },
    { key:'phone',label:'Phone' },{ key:'gst',label:'GST / tax number' },{ key:'address',label:'Address',type:'textarea' },
    { key:'status',label:'Relationship',options:['Prospect','Customer','Partner','Inactive'] },{key:'notes',label:'Notes',type:'textarea'} ] },
  contacts: { name:'Contacts',singular:'contact',description:'The people behind every company.',fields:[
    { key:'designation',label:'Designation' },{ key:'email',label:'Email',type:'email' },{ key:'phone',label:'Phone' },
    { key:'decisionMaker',label:'Decision maker',options:['No','Yes'] },{key:'notes',label:'Notes',type:'textarea'} ] },
  enquiries: { name:'Leads',singular:'lead',description:'Make contact, schedule discovery, and convert qualified leads.',fields:[
    {key:'companyName',label:'Company name (if not linked)'},{key:'contactName',label:'Contact person'},
    {key:'email',label:'Lead email',type:'email'},{key:'phone',label:'Lead phone'},
    { key:'contactId',label:'Contact',type:'contact' },{ key:'source',label:'Source',options:['Referral','Website','Email','WhatsApp','Phone','Event','Partner','Other'] },
    { key:'receivedDate',label:'Received date',type:'date',required:true },{ key:'status',label:'Lead stage',options:leadStages,required:true },
    { key:'requirements',label:'Customer requirements',type:'textarea',required:true },{ key:'products',label:'Zoho products / solution' },
    {key:'discoveryDate',label:'Discovery meeting date',type:'date'},{key:'discoveryTime',label:'Discovery time (India)',type:'time'},
    {key:'discoveryMode',label:'Discovery meeting mode',options:['Online','Offline']},{key:'discoveryLocation',label:'Meeting link / location'},
    { key:'nextFollowUp',label:'Next follow-up',type:'date' },{key:'notes',label:'Outreach / discovery notes',type:'textarea'} ] },
  opportunities: { name:'Opportunities',singular:'opportunity',description:'Plan the solution, send proposals, negotiate, and close.',fields:[
    { key:'enquiryId',label:'Original lead',type:'enquiry' },{ key:'contactId',label:'Contact',type:'contact' },{ key:'stage',label:'Opportunity stage',options:stages,required:true },
    { key:'products',label:'Zoho products / solution' },{ key:'amount',label:'Estimated value (INR)',type:'number' },
    { key:'expectedClose',label:'Expected close',type:'date' },{ key:'nextFollowUp',label:'Next follow-up',type:'date' },
    { key:'scope',label:'Solution scope',type:'textarea' },{ key:'notes',label:'Negotiation / closure notes',type:'textarea'} ] },
  activities: { name:'Activities',singular:'activity',description:'Every conversation. Every next step.',fields:[
    { key:'contactId',label:'Contact',type:'contact' },{key:'enquiryId',label:'Lead',type:'enquiry'},{ key:'opportunityId',label:'Opportunity',type:'opportunity' },
    { key:'type',label:'Activity type',options:['Call','Online meeting','Offline meeting','Email','Follow-up','Task'] },
    { key:'dueDate',label:'Due date',type:'date',required:true },{ key:'time',label:'Time (India)',type:'time' },
    { key:'status',label:'Status',options:['Scheduled','Completed','Cancelled'] },
    { key:'outcome',label:'Call / meeting outcome',options:['Pending','Connected','Disconnected','No answer','Rescheduled','Completed'] },
    { key:'location',label:'Meeting link / location' },{ key:'notes',label:'Meeting notes / next action',type:'textarea'} ] },
  proposals: { name:'Proposals',singular:'proposal',description:'Keep each version and record customer acceptance.',fields:[
    { key:'opportunityId',label:'Opportunity',type:'opportunity',required:true },{ key:'version',label:'Version',type:'number',required:true },
    { key:'amount',label:'Proposal amount (INR)',type:'number',required:true },{ key:'status',label:'Status',options:['Draft','Sent','Negotiating','Accepted','Rejected','Superseded'] },
    { key:'sentDate',label:'Sent date',type:'date' },{ key:'documentUrl',label:'Proposal document link',type:'url' },
    { key:'acceptedDate',label:'Acceptance date',type:'date' },{ key:'acceptedBy',label:'Accepted by' },
    { key:'acceptanceUrl',label:'Acceptance document link',type:'url' },{key:'notes',label:'Scope / negotiation notes',type:'textarea'} ] },
  invoices: { name:'Invoices',singular:'invoice',description:'Manual invoice records with payment follow-ups.',fields:[
    { key:'proposalId',label:'Accepted proposal',type:'proposal' },{ key:'invoiceNumber',label:'Invoice number',required:true },
    { key:'invoiceDate',label:'Invoice date',type:'date',required:true },{ key:'amount',label:'Invoice amount (INR)',type:'number',required:true },
    { key:'paidAmount',label:'Amount received (INR)',type:'number' },{ key:'dueDate',label:'Payment due date',type:'date',required:true },
    { key:'status',label:'Payment status',options:['Unpaid','Part paid','Paid','Cancelled'] },
    { key:'nextFollowUp',label:'Next payment follow-up',type:'date' },{key:'notes',label:'Payment notes',type:'textarea'} ] },
  projects: { name:'Implementation',singular:'project',description:'Turn accepted solutions into successful delivery.',fields:[
    { key:'opportunityId',label:'Accepted opportunity',type:'opportunity' },{ key:'products',label:'Zoho products' },
    { key:'status',label:'Delivery status',options:['Not started','Planning','In progress','Customer review','Completed','On hold'] },
    { key:'startDate',label:'Start date',type:'date' },{ key:'dueDate',label:'Target date',type:'date' },
    { key:'nextFollowUp',label:'Next follow-up',type:'date' },{key:'notes',label:'Milestones / delivery notes',type:'textarea'} ] },
};
export const moduleKeys = [...Object.keys(modules), 'administration'];
export function fullPermissions(): PermissionMap {
  return Object.fromEntries(moduleKeys.map(k => [k,{view:true,create:true,edit:true,delete:true}]));
}
export function hasPermission(permissions: PermissionMap, module: string, action: Action) {
  return permissions[module]?.view === true && permissions[module]?.[action] === true;
}
export function isDescendant(roles: Role[], childId: string, ancestorId: string) {
  if (childId === ancestorId) return false;
  const visited = new Set<string>(); let current: string | null = childId;
  while(current && !visited.has(current)) {
    visited.add(current); const role = roles.find(r => r.id === current);
    if (!role) return false;
    if (role.parentId === ancestorId) return true;
    current = role.parentId;
  }
  return false;
}
export function visibleOwner(me: Member, owner: Member | undefined, roles: Role[]) {
  return !!owner && (owner.id === me.id || isDescendant(roles,owner.roleId,me.roleId));
}
export function validHierarchy(roles: Role[]) {
  for(const r of roles) {
    const seen = new Set<string>(); let current: string | null = r.id;
    while(current) {
      if(seen.has(current)) return false;
      seen.add(current); const node=roles.find(x=>x.id===current);
      if(!node) return false; current=node.parentId;
    }
  }
  return true;
}
export function indiaToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
export function followUpDate(r: CRMRecord) {
  if(['Completed','Cancelled','Paid','Rejected','Not qualified','Disqualified','Converted'].includes(r.data.status)||r.data.stage==='Closed lost'||r.data.stage==='Accepted') return '';
  return r.data.nextFollowUp || (r.module==='enquiries'&&r.data.status==='Discovery scheduled'?r.data.discoveryDate:'') || (['activities','invoices','projects'].includes(r.module)?r.data.dueDate:'') || '';
}
