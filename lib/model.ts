export type Action = 'view' | 'create' | 'edit' | 'delete';
export type Role = { id: string; name: string; parentId: string | null };
export type PermissionMap = Record<string, Record<Action, boolean>>;
export type Member = { id: string; name: string; email: string; authId: string | null; roleId: string; profileId: string; active: number };
export type CRMRecord = { id: string; module: string; title: string; ownerId: string; companyId: string | null; data: Record<string, string>; createdAt: string; updatedAt: string };
export type Field = { key: string; label: string; type?: string; options?: string[]; required?: boolean };
export const stages = ['New enquiry', 'Qualification', 'Discovery', 'Solution planning', 'Proposal', 'Negotiation', 'Accepted', 'Closed lost'];
export const modules: Record<string, { name: string; singular: string; description: string; fields: Field[] }> = {
  companies: { name: 'Companies', singular: 'company', description: 'Your customer relationships, in one place.', fields: [
    { key:'industry',label:'Industry' },{ key:'website',label:'Website',type:'url' },{ key:'email',label:'Company email',type:'email' },
    { key:'phone',label:'Phone' },{ key:'gst',label:'GST / tax number' },{ key:'address',label:'Address',type:'textarea' },
    { key:'status',label:'Relationship',options:['Prospect','Customer','Partner','Inactive'] },{key:'notes',label:'Notes',type:'textarea'} ] },
  contacts: { name:'Contacts',singular:'contact',description:'The people behind every company.',fields:[
    { key:'designation',label:'Designation' },{ key:'email',label:'Email',type:'email' },{ key:'phone',label:'Phone' },
    { key:'decisionMaker',label:'Decision maker',options:['No','Yes'] },{key:'notes',label:'Notes',type:'textarea'} ] },
  enquiries: { name:'Enquiries',singular:'enquiry',description:'Capture requirements. Find the next opportunity.',fields:[
    { key:'contactId',label:'Contact',type:'contact' },{ key:'source',label:'Source',options:['Referral','Website','Email','WhatsApp','Phone','Event','Partner','Other'] },
    { key:'receivedDate',label:'Received date',type:'date',required:true },{ key:'status',label:'Qualification',options:['New','Reviewing','Qualified','Not qualified'] },
    { key:'requirements',label:'Customer requirements',type:'textarea',required:true },{ key:'products',label:'Zoho products / solution' },
    { key:'nextFollowUp',label:'Next follow-up',type:'date' },{key:'notes',label:'Notes',type:'textarea'} ] },
  opportunities: { name:'Opportunities',singular:'opportunity',description:'Move every solution from discovery to acceptance.',fields:[
    { key:'enquiryId',label:'Enquiry',type:'enquiry' },{ key:'contactId',label:'Contact',type:'contact' },{ key:'stage',label:'Sales stage',options:stages },
    { key:'products',label:'Zoho products / solution' },{ key:'amount',label:'Estimated value (INR)',type:'number' },
    { key:'expectedClose',label:'Expected close',type:'date' },{ key:'nextFollowUp',label:'Next follow-up',type:'date' },
    { key:'scope',label:'Solution scope',type:'textarea' },{ key:'notes',label:'Negotiation / closure notes',type:'textarea'} ] },
  activities: { name:'Activities',singular:'activity',description:'Every conversation. Every next step.',fields:[
    { key:'contactId',label:'Contact',type:'contact' },{ key:'opportunityId',label:'Opportunity',type:'opportunity' },
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
  if(r.data.status==='Completed'||r.data.status==='Cancelled'||r.data.status==='Paid'||r.data.status==='Rejected'||r.data.status==='Not qualified'||r.data.stage==='Closed lost'||r.data.stage==='Accepted') return '';
  return r.data.nextFollowUp || (['activities','invoices','projects'].includes(r.module)?r.data.dueDate:'') || '';
}
