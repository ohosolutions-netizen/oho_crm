import { context, allRecords, canSee, permit, database, log, APIError, errorResponse, checkOrigin } from '../../../lib/server';
import { modules, fullPermissions, hasPermission, visibleOwner, validHierarchy, type Role, type PermissionMap, type Member } from '../../../lib/model';
import { convertLead } from '../../../lib/workflow';
import { transition, updateFollowUp, visibleHistory } from '../../../lib/stage-service';
import { followUpErrors } from '../../../lib/stage-rules';
export const dynamic='force-dynamic';
export async function GET() {
  try {
    const c=await context(); const admin=hasPermission(c.permissions,'administration','view');
    const records=(await allRecords()).filter(r=>canSee(c,r));
    const owners=c.members.filter(u=>visibleOwner(c.me,u,c.roles)).map(u=>({id:u.id,name:u.name,active:u.active}));
    return Response.json({me:c.me,permissions:c.permissions,roles:c.roles,owners,records,stageHistory:await visibleHistory(c,records),
      profiles:admin?c.profiles.map(p=>({...p,permissions:JSON.parse(p.permissions)})):[],users:admin?c.members:[],
      audit:admin?await (database().prepare('SELECT * FROM audit ORDER BY created_at DESC LIMIT 150').all()).then(x=>x.results):[]
    },{headers:{'Cache-Control':'no-store'}});
  }catch(e){return errorResponse(e);}
}
function string(value:unknown,label:string,required=false) { if(value==null&&!required) return ''; if(typeof value!=='string'||value.length>10000||(required&&!value.trim())) throw new APIError(`Please enter a valid ${label}.`); return value.trim(); }
function permissions(value:unknown):PermissionMap {
  if(!value||typeof value!=='object') throw new APIError('Select module permissions.');
  return Object.fromEntries(Object.keys(fullPermissions()).map(k=>[k,Object.fromEntries(['view','create','edit','delete'].map(a=>[a,(value as Record<string,Record<string,boolean>>)[k]?.[a]===true]))])) as PermissionMap;
}
export async function POST(req:Request) {
  try {
    checkOrigin(req); const c=await context(); const b=await req.json() as Record<string,unknown>;
    const kind=string(b.kind,'operation',true); const operation=string(b.operation,'action',true);
    if(!['create','edit','delete'].includes(operation)) throw new APIError('Unknown action.');
    if(kind==='convert') {if(operation!=='create')throw new APIError('Unknown conversion action.');return await convertLead(c,b);}
    if(kind==='transition'){if(operation!=='edit')throw new APIError('Unknown stage action.');return await transition(c,b);}
    if(kind==='followup'){if(operation!=='edit')throw new APIError('Unknown follow-up action.');return await updateFollowUp(c,b);}
    const id=operation==='create'?crypto.randomUUID():string(b.id,'record ID',true);
    const queries: D1PreparedStatement[]=[];
    if(kind==='record') {
      const module=string(b.module,'module',true); if(!modules[module]) throw new APIError('Unknown module.');
      permit(c,module,operation as 'create'|'edit'|'delete');
      const existing=await allRecords(); const old=existing.find(r=>r.id===id);
      if(operation!=='create'&&(!old||old.module!==module||!canSee(c,old))) throw new APIError('Record unavailable.',404);
      if(module==='enquiries'&&old?.data.status==='Converted')throw new APIError('Converted leads are retained as history. Edit the linked opportunity.');
      if(operation==='delete') {
        if(module==='proposals'&&old?.data.status==='Accepted') throw new APIError('Accepted proposals are retained. Create a new version instead.');
        if(existing.some(r=>r.companyId===id||Object.values(r.data).some(v=>v===id))) throw new APIError('This record has linked records. Remove or relink them before deleting.');
        queries.push(database().prepare('DELETE FROM records WHERE id=?').bind(id));
      } else {
        const title=string(b.title,'record name',true); if(title.length>180) throw new APIError('Name must be 180 characters or fewer.');
        const ownerId=string(b.ownerId,'owner')||(operation==='create'?c.me.id:old!.ownerId);
        const owner=c.members.find(u=>u.id===ownerId);
        if(!owner?.active||!visibleOwner(c.me,owner,c.roles)) throw new APIError('Assign an active user within your hierarchy.');
        const companyId=module==='companies'?null:string(b.companyId,'company')||null;
        if(companyId) { const co=existing.find(r=>r.id===companyId&&r.module==='companies'); if(!co||!canSee(c,co)) throw new APIError('Select an accessible company.'); }
        if(['contacts','opportunities','proposals','invoices','projects'].includes(module)&&!companyId) throw new APIError('Select a company.');
        const input=(b.data||{}) as Record<string,unknown>; const data:Record<string,string>={...old?.data};
        for(const f of modules[module].fields) {
          const v=string(input[f.key],f.label,!!f.required); data[f.key]=v;
          if(f.options&&v&&!f.options.includes(v)) throw new APIError(`Invalid ${f.label}.`);
          if(f.type==='number'&&v&&(Number(v)<0||!Number.isFinite(Number(v)))) throw new APIError(`${f.label} must be a non-negative number.`);
          if(f.key==='version'&&v&&(!Number.isInteger(Number(v))||Number(v)<1)) throw new APIError('Proposal version must be a positive integer.');
          if(f.type==='date'&&v&&(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)) throw new APIError(`Invalid ${f.label}.`);
          if(f.type==='email'&&v&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new APIError('Enter a valid email address.');
          if(f.type==='url'&&v) { try { if(!['https:','http:'].includes(new URL(v).protocol)) throw new Error(); } catch { throw new APIError(`${f.label} must start with https:// or http://.`); } }
          const linkModule:Record<string,string>={contact:'contacts',enquiry:'enquiries',opportunity:'opportunities',proposal:'proposals'};
          if(linkModule[f.type||'']&&v) {
            const linked=existing.find(r=>r.id===v&&r.module===linkModule[f.type!]);
            if(!linked||!canSee(c,linked)||linked.companyId!==companyId) throw new APIError(`Select a ${f.label.toLowerCase()} for this company that you can access.`);
            if(module==='invoices'&&f.key==='proposalId'&&linked.data.status!=='Accepted') throw new APIError('Invoices must link to an accepted proposal.');
            if(module==='projects'&&f.key==='opportunityId'&&linked.data.stage!=='Accepted') throw new APIError('Implementation must link to an accepted opportunity.');
          }
        }
        if(['enquiries','opportunities'].includes(module)){
          const stageKey=module==='enquiries'?'status':'stage';const initial=module==='enquiries'?'New Lead':'Solution planning';
          if(operation==='create'&&data[stageKey]!==initial)throw new APIError(`New records start at ${initial}. Use Change stage to capture the information for later stages.`);
          if(old&&data[stageKey]!==old.data[stageKey])throw new APIError('Use Change stage to capture the required transition details.');
        }
        if(data.nextFollowUp&&(!old||data.nextFollowUp!==old.data.nextFollowUp||data.followUpAction!==old.data.followUpAction)){
          const errors=followUpErrors(data);if(errors.length)throw new APIError(errors.join(' '));data.followUpStatus='Pending';data.followUpNeeded='Yes';data.followUpCompletionNote='';data.followUpCompletedAt='';
        }
        if(!data.nextFollowUp&&old?.data.nextFollowUp){data.followUpStatus='Cancelled';data.followUpNeeded='No';}
        if(module==='enquiries') {
          if(data.status==='Converted')throw new APIError('Use Convert to opportunity to convert this lead.');
          if(data.status==='Discovery scheduled'&&!data.discoveryDate)throw new APIError('Set the discovery meeting date before scheduling discovery.');
          if(data.discoveryTime&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(data.discoveryTime))throw new APIError('Enter a valid discovery time.');
        }
        if(module==='companies'&&existing.some(r=>r.module===module&&r.id!==id&&r.title.toLowerCase()===title.toLowerCase())) throw new APIError('A company with this name already exists.');
        if(module==='proposals') {
          if(existing.some(r=>r.module===module&&r.id!==id&&r.data.opportunityId===data.opportunityId&&r.data.version===data.version)) throw new APIError('This proposal version already exists for the opportunity.');
          if(old&&old.data.status==='Accepted'&&(old.title!==title||JSON.stringify(old.data)!==JSON.stringify(data)||old.companyId!==companyId)) throw new APIError('Accepted proposals are retained as a record. Create a new version to make changes.');
          if(data.status==='Accepted'&&(!data.acceptedDate||!data.acceptedBy)) throw new APIError('Record the acceptance date and person before accepting a proposal.');
        }
        if(module==='invoices') {
          if(existing.some(r=>r.module===module&&r.id!==id&&r.data.invoiceNumber.toLowerCase()===data.invoiceNumber.toLowerCase())) throw new APIError('This invoice number already exists.');
          const paid=Number(data.paidAmount||0),total=Number(data.amount);
          if(paid>total) throw new APIError('Amount received cannot exceed invoice amount.');
          if(data.status==='Paid'&&paid!==total||data.status==='Unpaid'&&paid!==0||data.status==='Part paid'&&!(paid>0&&paid<total)) throw new APIError('Payment status must match the amount received.');
        }
        const now=new Date().toISOString();
        if(operation==='create') queries.push(database().prepare('INSERT INTO records (id,module,title,owner_id,company_id,data,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').bind(id,module,title,ownerId,companyId,JSON.stringify(data),now,now));
        else queries.push(database().prepare('UPDATE records SET title=?,owner_id=?,company_id=?,data=?,updated_at=? WHERE id=?').bind(title,ownerId,companyId,JSON.stringify(data),now,id));
      }
    } else {
      permit(c,'administration',operation as 'create'|'edit'|'delete');
      if(kind==='role') {
        const old=c.roles.find(r=>r.id===id); if(operation!=='create'&&!old) throw new APIError('Role unavailable.',404);
        if(operation==='delete') {
          if(c.members.some(u=>u.roleId===id)||c.roles.some(r=>r.parentId===id)) throw new APIError('Reassign users and child roles before deleting this role.');
          queries.push(database().prepare('DELETE FROM roles WHERE id=?').bind(id));
        } else {
          const role:Role={id,name:string(b.name,'role name',true),parentId:string(b.parentId,'parent role')||null};
          if(!validHierarchy([...c.roles.filter(r=>r.id!==id),role])) throw new APIError('Choose a valid parent. A role cannot report to itself or its descendants.');
          if(c.roles.some(r=>r.id!==id&&r.name.toLowerCase()===role.name.toLowerCase())) throw new APIError('Role name already exists.');
          queries.push(database().prepare('INSERT INTO roles (id,name,parent_id) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,parent_id=excluded.parent_id').bind(id,role.name,role.parentId));
        }
      } else if(kind==='profile') {
        if(operation!=='create'&&!c.profiles.some(p=>p.id===id)) throw new APIError('Profile unavailable.',404);
        if(operation==='delete') {
          if(c.members.some(u=>u.profileId===id)) throw new APIError('Reassign users before deleting this profile.');
          queries.push(database().prepare('DELETE FROM profiles WHERE id=?').bind(id));
        } else {
          const p=permissions(b.permissions); const name=string(b.name,'profile name',true);
          const remainingAdmins=c.members.filter(u=>u.active&&u.profileId!==id&&['view','create','edit','delete'].every(a=>hasPermission(JSON.parse(c.profiles.find(p=>p.id===u.profileId)?.permissions||'{}'),'administration',a as 'view')));
          if(!remainingAdmins.length&&c.members.some(u=>u.active&&u.profileId===id)&&!['view','create','edit','delete'].every(a=>hasPermission(p,'administration',a as 'view'))) throw new APIError('Keep at least one active user with full administration permissions.');
          queries.push(database().prepare('INSERT INTO profiles (id,name,permissions) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,permissions=excluded.permissions').bind(id,name,JSON.stringify(p)));
        }
      } else if(kind==='user') {
        const old=c.members.find(u=>u.id===id); if(operation!=='create'&&!old) throw new APIError('User unavailable.',404);
        if(operation==='delete') throw new APIError('Deactivate users to retain record ownership and audit history.');
        const name=string(b.name,'user name',true),email=string(b.email,'email',true).toLowerCase();
        if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new APIError('Enter a valid user email.');
        if(c.members.some(u=>u.id!==id&&u.email===email)) throw new APIError('This email already has a user.');
        const roleId=string(b.roleId,'role',true),profileId=string(b.profileId,'profile',true),active=b.active===false?0:1;
        if(!c.roles.some(r=>r.id===roleId)||!c.profiles.some(p=>p.id===profileId)) throw new APIError('Assign a valid role and profile.');
        const future:Member[]=[...c.members.filter(u=>u.id!==id),{id,name,email,authId:old?.authId||null,roleId,profileId,active}];
        if(!future.some(u=>u.active&&['view','create','edit','delete'].every(a=>hasPermission(JSON.parse(c.profiles.find(p=>p.id===u.profileId)?.permissions||'{}'),'administration',a as 'view')))) throw new APIError('Keep at least one active user with full administration permissions.');
        queries.push(database().prepare('INSERT INTO users (id,email,name,role_id,profile_id,active) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,email=excluded.email,role_id=excluded.role_id,profile_id=excluded.profile_id,active=excluded.active').bind(id,email,name,roleId,profileId,active));
      } else throw new APIError('Unknown operation.');
    }
    queries.push(await log(c.me.id,operation,`${kind}:${id}`,{module:b.module||'administration',before:kind==='record'?(await allRecords()).find(r=>r.id===id)||null:kind==='role'?c.roles.find(r=>r.id===id)||null:kind==='profile'?c.profiles.find(p=>p.id===id)||null:c.members.find(u=>u.id===id)||null,after:b}));
    await database().batch(queries);
    return Response.json({id,ok:true},{headers:{'Cache-Control':'no-store'}});
  }catch(e){return errorResponse(e);}
}
