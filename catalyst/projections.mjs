import {readFile} from 'node:fs/promises';
import {rows,insert,update,quote} from './client.mjs';
const schema=JSON.parse(await readFile(new URL('./schema.json',import.meta.url),'utf8'));
const names={companies:'Companies',contacts:'Contacts',enquiries:'Leads',leadEnquiries:'Enquiries',opportunities:'Opportunities',activities:'Activities',proposals:'Proposals',invoices:'Invoices',projects:'Implementations'};
const aliases={companyId:'CompanyAppId',ownerId:'OwnerAppId',contactId:'ContactAppId',enquiryId:'LeadAppId',opportunityId:'OpportunityAppId',proposalId:'ProposalAppId',convertedOpportunityId:'ConvertedOpportunityAppId',gst:'TaxNumber',type:'ActivityType',time:'ScheduledTime',followUpAction:'FollowUpAction'};
const upper=k=>aliases[k]||k[0].toUpperCase()+k.slice(1);
function normalized(table,row){
  const out={};for(const col of schema[table].filter(c=>c.category===2)){
    let value=row[col.column_name];if(value===undefined||value==='')value=null;
    if(value!==null){if(col.data_type==='boolean')value=value===true||value===1||value==='Yes';else if(['int','double','bigint'].includes(col.data_type))value=Number(value);else if(typeof value==='string'&&col.max_length&&value.length>Number(col.max_length)){value=col.column_name==='DataJson'?null:value.slice(0,Number(col.max_length));}}
    out[col.column_name]=value;
  }return out;
}
export function project(state){
  const all=Object.fromEntries(Object.keys(schema).filter(t=>!t.startsWith('Backend')).map(t=>[t,[]]));
  const add=(table,row)=>all[table].push(normalized(table,{...row,IsDeleted:false}));
  for(const r of state.roles)add('Roles',{AppId:r.id,Name:r.name,ParentRoleAppId:r.parent_id,DataJson:JSON.stringify(r)});
  for(const p of state.profiles){add('Profiles',{AppId:p.id,Name:p.name,Permissions:p.permissions,DataJson:JSON.stringify(p)});for(const[module,perms]of Object.entries(JSON.parse(p.permissions)))add('ModulePermissions',{AppId:`${p.id}:${module}`,PermissionKey:`${p.id}:${module}`,ProfileAppId:p.id,Module:module,CanView:perms.view,CanCreate:perms.create,CanEdit:perms.edit,CanDelete:perms.delete});}
  for(const u of state.users)add('Users',{AppId:u.id,Email:u.email,Name:u.name,RoleAppId:u.role_id,ProfileAppId:u.profile_id,Active:u.active,DataJson:JSON.stringify(u)});
  for(const r of state.records){const d=JSON.parse(r.data),table=names[r.module];if(!table)continue;
    const flat=Object.fromEntries(Object.entries(d).map(([k,v])=>[upper(k),v]));
    add(table,{...flat,AppId:r.id,Name:r.title,Title:r.title,CompanyAppId:r.company_id,OwnerAppId:r.owner_id,Relationship:d.status,Stage:d.stage||d.status,TaxNumber:d.gst,ProposalVersionKey:r.module==='proposals'?`${d.opportunityId}:${d.version}`:undefined,EntityCreatedAt:r.created_at,EntityUpdatedAt:r.updated_at,DataJson:JSON.stringify(r)});
    if(d.nextFollowUp||d.discoveryDate&&d.status==='Discovery scheduled'||d.proposalDueDate&&d.stage==='Proposal preparation'||['activities','invoices','projects'].includes(r.module)&&d.dueDate)add('FollowUps',{AppId:r.id,RecordModule:r.module,RecordAppId:r.id,OwnerAppId:r.owner_id,DueDate:d.nextFollowUp||d.discoveryDate||d.proposalDueDate||d.dueDate,ScheduledTime:d.followUpTime||d.discoveryTime||d.time,FollowUpAction:d.followUpAction||d.notes||'Follow up with customer',Status:d.followUpStatus||(['Disqualified','Junk Lead','Lead Lost'].includes(d.status)&&d.followUpNeeded!=='Yes'?'Cancelled':'Pending'),CompletedAt:d.followUpCompletedAt,CompletionNote:d.followUpCompletionNote,DataJson:JSON.stringify(d)});
  }
  for(const a of state.audit){add('AuditLog',{AppId:a.id,ActorAppId:a.actor_id,AuditAction:a.action,Target:a.target,Details:a.details,EventTime:a.created_at,DataJson:JSON.stringify(a)});if(['transition','convert','followup','note'].includes(a.action)){const d=JSON.parse(a.details);add('StageHistory',{AppId:a.id,RecordModule:d.module||'enquiries',RecordAppId:a.target.replace(/^(record|lead):/,''),ActorAppId:a.actor_id,FromStage:d.fromStage||'',ToStage:d.toStage||(a.action==='convert'?'Converted':d.action),CapturedDetails:JSON.stringify(d.data||d.after||{}),EventTime:a.created_at});}}
  for(const s of state.settings){add('Settings',{AppId:s.key,SettingKey:s.key,SettingValue:s.value});if(s.key.startsWith('lead_conversion:'))add('ConversionClaims',{AppId:s.key,LeadAppId:s.key.slice('lead_conversion:'.length),OpportunityAppId:s.value,Status:'Committed'});}
  return all;
}
export async function sync(state,previous,progress){
  const next=project(state),old=previous?project(previous):{};
  for(const[table,desired]of Object.entries(next)){
    if(JSON.stringify(desired)===JSON.stringify(old[table]))continue;
    const oldById=new Map((old[table]||[]).map(r=>[r.AppId,r])),wanted=new Set(desired.map(r=>r.AppId));
    const changed=desired.filter(r=>JSON.stringify(r)!==JSON.stringify(oldById.get(r.AppId))),removed=(old[table]||[]).filter(r=>!wanted.has(r.AppId));
    const changedIds=[...new Set([...changed,...removed].map(r=>r.AppId))];
    let remote=[];
    if(previous&&changedIds.length<1000){for(let i=0;i<changedIds.length;i+=100)remote.push(...await rows(table,`AppId IN (${changedIds.slice(i,i+100).map(quote).join(',')})`));}
    else remote=await rows(table);
    const byId=new Map(remote.map(r=>[r.AppId,r]));
    const creates=[],updates=[];
    for(const row of previous&&changedIds.length<1000?changed:desired){const existing=byId.get(row.AppId);if(!existing)creates.push(row);else if(Object.keys(row).some(k=>existing[k]!==row[k]))updates.push({...row,ROWID:existing.ROWID});}
    for(const row of remote)if(!wanted.has(row.AppId)&&!row.IsDeleted&&!(table==='Settings'&&['zoho-note:','zoho-sync:'].some(prefix=>String(row.AppId).startsWith(prefix))))updates.push({ROWID:row.ROWID,IsDeleted:true});
    progress?.({table,done:0,total:creates.length+updates.length});
    for(let i=0;i<creates.length;i+=100){await insert(table,creates.slice(i,i+100));progress?.({table,done:Math.min(i+100,creates.length),total:creates.length+updates.length});}
    for(let i=0;i<updates.length;i+=100){await update(table,updates.slice(i,i+100));progress?.({table,done:creates.length+Math.min(i+100,updates.length),total:creates.length+updates.length});}
  }
}
