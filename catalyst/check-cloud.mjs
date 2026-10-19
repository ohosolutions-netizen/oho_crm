import assert from 'node:assert/strict';
const origin='https://oho-crm-60091125992.development.catalystserverless.in',base=origin+'/server/ohocrm';
const login=await fetch(base+'/api/identity',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({email:'c8tyvch5hn@privaterelay.appleid.com'})});
assert.equal(login.status,200,await login.clone().text());const cookie=login.headers.getSetCookie().find(c=>c.startsWith('oho_crm_email='))?.split(';')[0];assert.ok(cookie);
let checks=0;const pass=label=>{checks++;console.log('PASS '+label);};
async function api(payload,expected=200){const r=await fetch(base+'/api/crm',{method:payload?'POST':'GET',headers:{cookie,...(payload?{'Content-Type':'application/json',Origin:origin}:{})},body:payload?JSON.stringify(payload):undefined});const body=await r.json();assert.equal(r.status,expected,JSON.stringify(body));return body;}
const state=await api();assert.ok(state.records.length>=7);pass('Migrated records available from the hosted server');
const prefix='Cloud regression '+crypto.randomUUID().slice(0,8),created=[];
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const create=async(module,title,data,companyId=null)=>{const r=await api({kind:'record',operation:'create',module,title:prefix+' '+title,ownerId:state.me.id,companyId,data});created.push(r.id);return r.id;};
try{
 const company=await create('companies','Company',{status:'Prospect'});
 const contact1=await create('contacts','Employee one',{email:'employee1@example.test',decisionMaker:'Yes'},company);
 await create('contacts','Employee two',{email:'employee2@example.test',decisionMaker:'No'},company);
 assert.equal((await api()).records.filter(r=>r.companyId===company&&r.module==='contacts').length,2);pass('Company supports multiple contacts');
 const lead=await create('enquiries','Lead',{status:'New Lead',receivedDate:today,source:'Email',requirements:'Implement Zoho CRM for sales',contactId:contact1,contactName:'Employee one',products:'Zoho CRM'},company);
 let current=(await api()).records.find(r=>r.id===lead);
 await api({kind:'transition',operation:'edit',id:lead,targetStage:'Connected',expectedUpdatedAt:current.updatedAt,data:{stageNote:'Missing required fields',followUpNeeded:'No'}},400);pass('Stage-required information enforced');
 await api({kind:'transition',operation:'edit',id:lead,targetStage:'Contacted',expectedUpdatedAt:current.updatedAt,data:{contactMethod:'Call',contactDate:today,stageNote:'Called customer about implementation',followUpNeeded:'Yes',nextFollowUp:today,followUpAction:'Confirm discovery meeting',followUpTime:'15:00'}});
 const stale=current;current=(await api()).records.find(r=>r.id===lead);assert.equal(current.data.status,'Contacted');assert.equal(current.data.followUpAction,'Confirm discovery meeting');pass('Stage and follow-up persist across separate server requests');
 await api({kind:'followup',operation:'edit',id:lead,action:'plan',expectedUpdatedAt:stale.updatedAt,data:{nextFollowUp:today,followUpAction:'Stale attempt'}},409);pass('Stale changes rejected');
 await api({kind:'transition',operation:'edit',id:lead,targetStage:'Connected',expectedUpdatedAt:current.updatedAt,data:{contactName:'Employee one',contactMethod:'Call',contactDate:today,requirements:'Implement sales CRM',stageNote:'Customer confirmed interest',followUpNeeded:'No',taskDisposition:'Close'}});
 const payload={kind:'convert',operation:'create',leadId:lead,title:prefix+' Opportunity',companyId:company,contactId:contact1,amount:'25000'};
 const [a,b]=await Promise.all([fetch(base+'/api/crm',{method:'POST',headers:{cookie,'Content-Type':'application/json',Origin:origin},body:JSON.stringify(payload)}),fetch(base+'/api/crm',{method:'POST',headers:{cookie,'Content-Type':'application/json',Origin:origin},body:JSON.stringify(payload)})]);
 const bodies=await Promise.all([a.json(),b.json()]);assert.deepEqual([a.status,b.status].sort(),[200,409],JSON.stringify(bodies));
 const opportunity=bodies[[a.status,b.status].indexOf(200)].id;created.push(opportunity);
 const after=await api();assert.equal(after.records.filter(r=>r.module==='opportunities'&&r.data.enquiryId===lead).length,1);assert.equal(after.records.find(r=>r.id===lead).data.status,'Converted');assert.ok(after.stageHistory.some(e=>e.recordId===lead&&e.toStage==='Connected'));pass('Concurrent conversion creates one opportunity and retains history');
 await api({kind:'record',operation:'delete',module:'companies',id:company},400);pass('Linked company deletion is prevented');
 console.log(`${checks} hosted Catalyst integration checks passed.`);
}finally{
 // Retain the named regression lead/conversion as a visible test example because
 // converted lead retention is part of the CRM contract. Other cleanup would
 // require breaking historical links; no direct datastore deletion is used.
 console.log('Test example retained under prefix: '+prefix);
}
