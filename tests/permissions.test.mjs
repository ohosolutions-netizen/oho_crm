import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fullPermissions, hasPermission, visibleOwner, isDescendant, validHierarchy, followUpDate, indiaToday, normalizeData, canConvertLead } from '../lib/model.ts';
const roles=[{id:'admin',name:'Admin',parentId:null,sharePeers:0},{id:'manager',name:'Manager',parentId:'admin',sharePeers:0},{id:'executive',name:'Executive',parentId:'manager',sharePeers:0},{id:'other',name:'Other branch',parentId:'admin',sharePeers:0}];
const member=(id,roleId)=>({id,roleId,name:id,email:`${id}@example.test`,authId:null,profileId:'standard',active:1});
test('visibility covers own records and all descendants, but excludes peers and unrelated branches',()=>{
  const admin=member('a','admin'),manager=member('m','manager'),exec=member('e','executive'),peer=member('p','executive'),other=member('o','other');
  assert.equal(visibleOwner(admin,exec,roles),true);
  assert.equal(visibleOwner(manager,exec,roles),true);
  assert.equal(visibleOwner(exec,exec,roles),true);
  assert.equal(visibleOwner(exec,peer,roles),false);
  assert.equal(visibleOwner(manager,other,roles),false);
  assert.equal(visibleOwner(exec,manager,roles),false);
  assert.equal(visibleOwner(admin,undefined,roles),false);
});
test('peer visibility follows the sharing flag on the common role',()=>{
  const first=member('first','executive'),second=member('second','executive');
  assert.equal(visibleOwner(first,second,roles),false);
  const shared=roles.map(role=>role.id==='executive'?{...role,sharePeers:1}:role);
  assert.equal(visibleOwner(first,second,shared),true);
  assert.equal(visibleOwner(first,member('manager','manager'),shared),false);
});
test('module actions are separate and every action also requires View',()=>{
  const p=fullPermissions();p.enquiries.delete=false;
  assert.equal(hasPermission(p,'enquiries','view'),true);assert.equal(hasPermission(p,'enquiries','edit'),true);assert.equal(hasPermission(p,'enquiries','delete'),false);
  p.enquiries.view=false;assert.equal(hasPermission(p,'enquiries','create'),false);assert.equal(hasPermission(p,'enquiries','edit'),false);assert.equal(hasPermission(p,'unknown','view'),false);
});
test('admin dashboard access can be granted without administration access',()=>{
  const p=fullPermissions();p.administration={view:false,create:false,edit:false,delete:false,call:false};
  assert.equal(hasPermission(p,'adminDashboard','view'),true);
  assert.equal(hasPermission(p,'administration','view'),false);
  p.adminDashboard.view=false;assert.equal(hasPermission(p,'adminDashboard','view'),false);
  const legacy=fullPermissions();delete legacy.adminDashboard;assert.equal(hasPermission(legacy,'adminDashboard','view'),true);
});
test('hierarchies reject cycles, self-parenting, and missing parents',()=>{
  assert.equal(validHierarchy(roles),true);
  assert.equal(validHierarchy([...roles.filter(r=>r.id!=='admin'),{id:'admin',name:'Admin',parentId:'executive'}]),false);
  assert.equal(validHierarchy([{id:'x',name:'X',parentId:'x'}]),false);
  assert.equal(validHierarchy([{id:'x',name:'X',parentId:'missing'}]),false);
  assert.equal(isDescendant([{id:'x',parentId:'y'},{id:'y',parentId:'x'}],'x','missing'),false);
});
test('completed and paid records leave the follow-up queue; next action overrides due date',()=>{
  const record={module:'activities',data:{dueDate:'2026-10-12',status:'Scheduled'}};
  assert.equal(followUpDate(record),'2026-10-12');
  assert.equal(followUpDate({...record,data:{...record.data,status:'Completed'}}),'');
  assert.equal(followUpDate({module:'invoices',data:{status:'Paid',nextFollowUp:'2026-10-13'}}),'');
  assert.equal(followUpDate({module:'invoices',data:{status:'Part paid',dueDate:'2026-10-10',nextFollowUp:'2026-10-15'}}),'2026-10-15');
});
test('follow-up dates use India time across the UTC date boundary',()=>{
  assert.equal(indiaToday(new Date('2026-10-12T20:00:00Z')),'2026-10-13');
});
test('legacy data remains usable in the split lead and opportunity pipelines',()=>{
  assert.equal(normalizeData('enquiries',{status:'New'}).status,'New Lead');
  assert.equal(normalizeData('enquiries',{status:'Qualified'}).status,'Discovery completed');
  assert.equal(normalizeData('opportunities',{stage:'Proposal'}).stage,'Proposal sent');
  assert.equal(normalizeData('opportunities',{stage:'Discovery'}).stage,'Solution planning');
});
test('conversion starts after contact and converted leads leave the follow-up queue',()=>{
  assert.equal(canConvertLead({status:'New Lead'}),false);
  assert.equal(canConvertLead({status:'Not connected'}),false);
  assert.equal(canConvertLead({status:'Connected'}),false);
  assert.equal(canConvertLead({status:'Discovery completed'}),true);
  assert.equal(canConvertLead({status:'Converted',convertedOpportunityId:'x'}),false);
  assert.equal(followUpDate({module:'enquiries',data:{status:'Discovery scheduled',discoveryDate:'2026-10-20'}}),'2026-10-20');
  assert.equal(followUpDate({module:'enquiries',data:{status:'Converted',nextFollowUp:'2026-10-20'}}),'');
});
