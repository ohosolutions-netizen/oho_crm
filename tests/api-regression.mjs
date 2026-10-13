// Run only against the disposable loopback preview and its local D1 database.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fullPermissions } from '../lib/model.ts';
if(process.env.CRM_TEST_LOCAL!=='1') throw new Error('Set CRM_TEST_LOCAL=1 to test the local preview.');
const origin='http://127.0.0.1:5173';
const folder=join(process.cwd(),'.wrangler','state','v3','d1','miniflare-D1DatabaseObject');
const dbFile=readdirSync(folder).find(f=>f.endsWith('.sqlite')&&f!=='metadata.sqlite');
if(!dbFile)throw new Error('Migrate the local preview database first.');
const db=new DatabaseSync(join(folder,dbFile));
db.exec('PRAGMA busy_timeout=5000');
const prefix='regression-'+crypto.randomUUID();const created=[];const fixtures=[];let me;
const login=await fetch(origin+'/api/identity',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({email:'seedy@sites.test'})});
const cookie=login.headers.get('set-cookie')?.split(';')[0];
assert.ok(cookie,'Email selection cookie');
async function request(payload,expected=200,headers={}) {
  const r=await fetch(origin+'/api/crm',{method:payload?'POST':'GET',headers:{cookie,...(payload?{'Content-Type':'application/json',Origin:origin}:{}),...headers},body:payload?JSON.stringify(payload):undefined});
  const text=await r.text();let body;try{body=JSON.parse(text);}catch{body={error:text};}assert.equal(r.status,expected,JSON.stringify(body));return body;
}
async function create(module,title,data={},companyId=null) {
  const x=await request({kind:'record',operation:'create',module,title:prefix+' '+title,companyId,data});created.push(x.id);return x.id;
}
function fixtureUser(id,role,profile) {const userId=prefix+'-'+id;db.prepare('INSERT INTO users (id,email,name,role_id,profile_id,active) VALUES (?,?,?,?,?,1)').run(userId,userId+'@example.test',id,role,profile);fixtures.push(userId);return userId;}
function fixtureRecord(id,owner,module='enquiries') {const recordId=prefix+'-'+id;db.prepare('INSERT INTO records (id,module,title,owner_id,data,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(recordId,module,id,owner,JSON.stringify({requirements:'test',receivedDate:'2026-10-13',status:'New'}),new Date().toISOString(),new Date().toISOString());created.push(recordId);return recordId;}
let passed=0;
function pass(name){console.log('PASS '+name);passed++;}
try {
  assert.equal((await fetch(origin+'/api/crm')).status,401);pass('Anonymous API calls are rejected');
  const initial=await request();me=initial.me;
  assert.equal(me.email,'seedy@sites.test','Only local test identity may be modified');
  const invalidEmail=await fetch(origin+'/api/identity',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({email:'invalid'})});assert.equal(invalidEmail.status,400);
  const unknownEmail=await fetch(origin+'/api/identity',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({email:prefix+'-unknown@example.test'})});assert.equal(unknownEmail.status,403);
  const caseEmail=await fetch(origin+'/api/identity',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({email:' SEEDY@SITES.TEST '})});assert.equal(caseEmail.status,200);pass('Email-only entry validates and normalizes the selected team email');
  const co=await create('companies','Meridian',{industry:'Manufacturing',status:'Prospect'});
  const c1=await create('contacts','Anika',{email:'anika@example.test'},co);
  const c2=await create('contacts','Rohan',{email:'rohan@example.test'},co);
  assert.equal((await request()).records.filter(r=>r.companyId===co&&r.module==='contacts').length,2);pass('One company has multiple employee contacts');
  const leadData={status:'New Lead',companyName:prefix+' Raw Company',contactName:'Nisha',email:'nisha@example.test',phone:'9000000000',source:'Email',receivedDate:'2026-10-13',requirements:'CRM discovery and proposal',products:'Zoho CRM',notes:'Customer wants a sales process',nextFollowUp:'2026-10-20'};
  const rawLead=await create('enquiries','Raw lead',leadData);
  for(const status of ['Contacted','Not connected','Connected'])await request({kind:'record',operation:'edit',id:rawLead,module:'enquiries',title:prefix+' Raw lead',data:{...leadData,status}});
  await request({kind:'record',operation:'edit',id:rawLead,module:'enquiries',title:prefix+' Raw lead',data:{...leadData,status:'Discovery scheduled'}},400);
  await request({kind:'record',operation:'edit',id:rawLead,module:'enquiries',title:prefix+' Raw lead',data:{...leadData,status:'Discovery scheduled',discoveryDate:'2026-10-19',discoveryTime:'10:30',discoveryMode:'Online'}});
  const outreach=await create('activities','Raw lead outreach',{enquiryId:rawLead,type:'Call',dueDate:'2026-10-13',status:'Completed',outcome:'Connected'});
  await request({kind:'record',operation:'edit',id:rawLead,module:'enquiries',title:prefix+' Raw lead',data:{...leadData,status:'Discovery completed',discoveryDate:'2026-10-19'}});
  const converted=await request({kind:'convert',operation:'create',leadId:rawLead,title:prefix+' Converted opportunity',amount:'80000'});
  created.push(converted.id,converted.companyId,converted.contactId);
  const conversionRecords=(await request()).records;const original=conversionRecords.find(r=>r.id===rawLead),convertedOpp=conversionRecords.find(r=>r.id===converted.id);
  assert.equal(original.data.status,'Converted');assert.equal(original.data.convertedOpportunityId,converted.id);assert.equal(convertedOpp.data.stage,'Solution planning');assert.equal(convertedOpp.data.scope,leadData.requirements);assert.equal(convertedOpp.ownerId,original.ownerId);assert.equal(convertedOpp.data.enquiryId,rawLead);assert.equal(convertedOpp.data.nextFollowUp,leadData.nextFollowUp);assert.ok(conversionRecords.find(r=>r.id===outreach));
  assert.equal(conversionRecords.find(r=>r.id===converted.contactId).companyId,converted.companyId);
  await request({kind:'convert',operation:'create',leadId:rawLead},409);
  await request({kind:'record',operation:'edit',id:rawLead,module:'enquiries',title:'Tamper',companyId:converted.companyId,data:{...leadData,status:'Connected'}},400);
  pass('Lead outreach and discovery convert atomically to an opportunity, retaining company, contact and history');
  const newLead=await create('enquiries','Not connected lead',{...leadData,status:'Not connected'},co);await request({kind:'convert',operation:'create',leadId:newLead},409);
  const raceLead=await create('enquiries','Conversion race',{...leadData,companyName:'',contactName:'',email:'',status:'Connected'},co);
  const race=await Promise.all([200,200].map(()=>fetch(origin+'/api/crm',{method:'POST',headers:{cookie,'Content-Type':'application/json',Origin:origin},body:JSON.stringify({kind:'convert',operation:'create',leadId:raceLead})})));
  assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);for(const r of race){const body=await r.json();if(r.status===200)created.push(body.id);}
  assert.equal((await request()).records.filter(r=>r.module==='opportunities'&&r.data.enquiryId===raceLead).length,1);pass('Unconnected leads cannot convert and concurrent conversion creates only one opportunity');
  const enquiry=await create('enquiries','Zoho CRM enquiry',{requirements:'CRM and process implementation',receivedDate:'2026-10-13',source:'Referral',status:'Discovery completed',contactId:c1,nextFollowUp:'2026-10-12'},co);
  const oppData={enquiryId:enquiry,contactId:c1,stage:'Negotiation',amount:'125000',products:'Zoho CRM',scope:'Sales pipeline'};
  const opp=await create('opportunities','CRM implementation',oppData,co);
  const activity=await create('activities','Discovery call',{contactId:c1,opportunityId:opp,type:'Call',dueDate:'2026-10-12',status:'Scheduled',outcome:'Disconnected'},co);
  assert.ok((await request()).records.find(r=>r.id===activity));pass('Enquiries, opportunities, disconnected calls and follow-up dates persist');
  const pd={opportunityId:opp,version:'1',amount:'125000',status:'Sent',sentDate:'2026-10-13'};
  const p1=await create('proposals','Proposal v1',pd,co);
  const p2=await create('proposals','Proposal v2',{...pd,version:'2',amount:'120000'},co);
  await request({kind:'record',operation:'create',module:'proposals',title:'Duplicate version',companyId:co,data:pd},400);
  await request({kind:'record',operation:'edit',module:'proposals',id:p2,title:prefix+' Proposal v2',companyId:co,data:{...pd,version:'2',amount:'120000',status:'Accepted'}},400);
  const accepted={...pd,version:'2',amount:'120000',status:'Accepted',acceptedDate:'2026-10-13',acceptedBy:'Anika'};
  await request({kind:'record',operation:'edit',module:'proposals',id:p2,title:prefix+' Proposal v2',companyId:co,data:accepted});
  await request({kind:'record',operation:'edit',module:'proposals',id:p2,title:prefix+' Proposal v2',companyId:co,data:{...accepted,amount:'119000'}},400);
  assert.ok((await request()).records.find(r=>r.id===p1));pass('Proposal versions remain separate; acceptance is validated and accepted versions are protected');
  const invoiceData={proposalId:p2,invoiceNumber:prefix+'-INV-001',invoiceDate:'2026-10-13',amount:'120000',paidAmount:'0',dueDate:'2026-10-20',status:'Unpaid',nextFollowUp:'2026-10-16'};
  const invoice=await create('invoices','INV-001',invoiceData,co);
  await request({kind:'record',operation:'edit',module:'invoices',id:invoice,title:prefix+' INV-001',companyId:co,data:{...invoiceData,status:'Paid'}},400);
  await request({kind:'record',operation:'edit',module:'invoices',id:invoice,title:prefix+' INV-001',companyId:co,data:{...invoiceData,status:'Part paid',paidAmount:'40000'}});
  await request({kind:'record',operation:'create',module:'invoices',title:'Rejected draft link',companyId:co,data:{...invoiceData,proposalId:p1,invoiceNumber:prefix+'-INV-002'}},400);
  pass('Manual invoices enforce accepted links and consistent payment amounts');
  await request({kind:'record',operation:'edit',module:'opportunities',id:opp,title:prefix+' CRM implementation',companyId:co,data:{...oppData,stage:'Accepted'}});
  await create('projects','Zoho CRM delivery',{opportunityId:opp,status:'Planning',startDate:'2026-10-13',dueDate:'2026-11-13'},co);pass('Accepted opportunity links to implementation');
  await request({kind:'record',operation:'delete',module:'companies',id:co},400);
  await request({kind:'record',operation:'edit',module:'contacts',id:c2,title:'Invalid contact',companyId:co,data:{email:'invalid'}},400);
  await request({kind:'record',operation:'create',module:'activities',title:'Invalid date',companyId:co,data:{dueDate:'2026-02-30',status:'Scheduled'}},400);
  await request({kind:'record',operation:'create',module:'companies',title:'Cross origin'},403,{Origin:'https://example.test'});pass('Linked deletion, invalid inputs and cross-origin writes are blocked');
  const role=await request({kind:'role',operation:'create',name:prefix+' Junior',parentId:'executive'});fixtures.push(role.id);
  await request({kind:'role',operation:'edit',id:'admin',name:'Admin',parentId:role.id},400);pass('Role Designer rejects hierarchy cycles');
  const p=fullPermissions();p.enquiries.delete=false;p.administration={view:false,create:false,edit:false,delete:false};
  const profile=await request({kind:'profile',operation:'create',name:prefix+' Sales',permissions:p});fixtures.push(profile.id);
  await request({kind:'user',operation:'create',name:'Incomplete',email:'incomplete@example.test',roleId:'manager'},400);
  const newUser=await request({kind:'user',operation:'create',name:prefix+' Invite',email:prefix+'@example.test',roleId:'executive',profileId:profile.id});fixtures.push(newUser.id);pass('Users require both role and profile');
  const subordinate=fixtureUser('executive','executive',profile.id),indirect=fixtureUser('junior',role.id,profile.id),peer=fixtureUser('peer','manager',profile.id),above=fixtureUser('above','admin','administrator');
  const branch=prefix+'-branch';db.prepare('INSERT INTO roles (id,name,parent_id) VALUES (?,?,?)').run(branch,'Unrelated branch','admin');fixtures.push(branch);
  const other=fixtureUser('other',branch,profile.id);
  const directRecord=fixtureRecord('direct',subordinate),indirectRecord=fixtureRecord('indirect',indirect),peerRecord=fixtureRecord('peer-record',peer),otherRecord=fixtureRecord('other-record',other),aboveRecord=fixtureRecord('above-record',above);
  db.prepare('UPDATE users SET role_id=?,profile_id=? WHERE id=?').run('manager',profile.id,me.id);
  const manager=await request();const ids=manager.records.map(r=>r.id);
  assert.ok(ids.includes(directRecord)&&ids.includes(indirectRecord));assert.ok(!ids.includes(peerRecord)&&!ids.includes(otherRecord)&&!ids.includes(aboveRecord));
  assert.deepEqual(manager.users,[]);assert.deepEqual(manager.profiles,[]);assert.deepEqual(manager.audit,[]);
  await request({kind:'record',operation:'edit',module:'enquiries',id:peerRecord,title:'Forbidden',data:{receivedDate:'2026-10-13',requirements:'test'}},404);
  await request({kind:'record',operation:'delete',module:'enquiries',id:directRecord},403);
  await request({kind:'role',operation:'create',name:'Forbidden role'},403);
  await request({kind:'record',operation:'edit',module:'enquiries',id:directRecord,title:'Allowed edit',data:{receivedDate:'2026-10-13',requirements:'Updated by manager',status:'Connected'}});
  pass('Real API permits descendant visibility and edits but denies peer/branch access, Delete and Administration');
  p.enquiries.view=false;db.prepare('UPDATE profiles SET permissions=? WHERE id=?').run(JSON.stringify(p),profile.id);
  assert.ok(!(await request()).records.some(r=>r.module==='enquiries'));
  await request({kind:'record',operation:'edit',module:'enquiries',id:directRecord,title:'Forbidden',data:{requirements:'test',receivedDate:'2026-10-13'}},403);pass('Revoking View removes records and blocks direct edit requests immediately');
  db.prepare('UPDATE users SET active=0 WHERE id=?').run(me.id);await request(undefined,403);pass('Deactivated users lose access immediately');
} finally {
  if(me)db.prepare('UPDATE users SET role_id=?,profile_id=?,active=? WHERE id=?').run(me.roleId,me.profileId,me.active,me.id);
  for(const id of created)db.prepare('DELETE FROM records WHERE id=?').run(id);
  for(const id of created)db.prepare('DELETE FROM settings WHERE key=?').run('lead_conversion:'+id);
  db.prepare("DELETE FROM audit WHERE details LIKE ? OR target LIKE ?").run('%'+prefix+'%','%'+prefix+'%');
  for(const id of fixtures){db.prepare('DELETE FROM users WHERE id=?').run(id);}
  for(const id of fixtures){db.prepare('DELETE FROM profiles WHERE id=?').run(id);db.prepare('DELETE FROM roles WHERE id=?').run(id);}
  db.close();
}
console.log(`${passed} API regression checks passed; local test fixtures removed.`);
