import {APIError,allRecords,canSee,database,permit,type Context} from './server';
import {visibleOwner} from './model';
import {previewZohoCSV} from './zoho-lead-import';
export async function importZohoLeads(c:Context,b:Record<string,unknown>){
 permit(c,'enquiries','create');if(typeof b.csv!=='string'||b.csv.length>1000000)throw new APIError('Choose a Zoho CRM CSV export up to 1 MB.');
 const owner=c.members.find(m=>m.id===b.ownerId&&m.active&&visibleOwner(c.me,m,c.roles));if(!owner)throw new APIError('Select an active record owner in your hierarchy.');
 let leads;try{leads=previewZohoCSV(b.csv);}catch(e){throw new APIError(e instanceof Error?e.message:'Invalid CSV.');}
 const invalid=leads.filter(r=>r.errors.length);if(invalid.length)throw new APIError(`Row ${invalid[0].row}: ${invalid[0].errors.join('; ')}. Nothing was imported.`);
 if(leads.some(r=>Object.values(r.data).some(v=>v.length>10000)||r.title.length>180))throw new APIError('A lead contains a value that is too long. Nothing was imported.');
 const existing=await allRecords(),ids=new Set(existing.filter(r=>r.module==='enquiries').map(r=>r.data.zohoCRMId).filter(Boolean)),fingerprints=new Set(existing.filter(r=>r.module==='enquiries').map(r=>r.data.zohoImportFingerprint).filter(Boolean));
 const statements:D1PreparedStatement[]=[];let imported=0,skipped=0;const now=new Date().toISOString();
 for(const lead of leads){const canonical={title:lead.title,data:{...lead.data,receivedDate:lead.data.receivedDate,receivedTime:lead.data.receivedTime}};if(!lead.data.zohoCreatedTime)canonical.data.receivedDate='';const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(canonical))))).map(v=>v.toString(16).padStart(2,'0')).join('');
  if(lead.data.zohoCRMId?ids.has(lead.data.zohoCRMId):fingerprints.has(hash)){skipped++;continue;}
  const id=crypto.randomUUID(),company=existing.find(r=>r.module==='companies'&&canSee(c,r)&&r.title.toLowerCase()===lead.data.companyName.toLowerCase());const data={...lead.data,zohoImportFingerprint:hash,importedAt:now};
  statements.push(database().prepare('INSERT INTO records (id,module,title,owner_id,company_id,data,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').bind(id,'enquiries',lead.title,owner.id,company?.id||null,JSON.stringify(data),now,now));
  if(lead.data.zohoCRMId)ids.add(lead.data.zohoCRMId);fingerprints.add(hash);imported++;
 }
 if(statements.length){statements.push(database().prepare('INSERT INTO audit (id,actor_id,action,target,details,created_at) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),c.me.id,'import','Zoho CRM Leads',JSON.stringify({imported,skipped,ownerId:owner.id}),now));await database().batch(statements);}
 return Response.json({ok:true,id:'zoho-import',imported,skipped},{headers:{'Cache-Control':'no-store'}});
}
