export async function repairAuditBatch(audits,{confirmed,readExisting,write,batchSize=100}){
 const pending=[...new Map(audits.filter(a=>a?.id&&!confirmed.has(a.id)).map(a=>[a.id,a])).values()],batches=[];
 for(let i=0;i<pending.length;i+=batchSize)batches.push(pending.slice(i,i+batchSize).map(a=>a.id));
 for(let i=0;i<batches.length;i+=4){const found=await Promise.all(batches.slice(i,i+4).map(readExisting));for(const ids of found)for(const id of ids)confirmed.add(id);}
 for(const audit of pending)if(!confirmed.has(audit.id)){await write(audit);confirmed.add(audit.id);}
}
