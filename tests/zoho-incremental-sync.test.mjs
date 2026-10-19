import assert from 'node:assert/strict';import {sourceId,leadId,mapLead,fetchIncremental} from '../catalyst/zoho-sync/engine.mjs';
assert.equal(sourceId('zcrm_123'),'123');assert.equal(leadId('123'),leadId('zcrm_123'));assert.throws(()=>mapLead({id:'123',Last_Name:'Test',Created_Time:'2026-10-16T00:00:00Z'},'owner',new Date().toISOString()),/phone/);
const known=new Set(['123']);let calls=0;const checkpoint='2026-10-15T00:00:00Z',now='2026-10-16T00:00:00Z';
const run=()=>fetchIncremental({checkpoint,now,fetchPage:async({since,page})=>{assert.equal(since,'2026-10-14T23:58:00.000Z');calls++;return page===1?{data:[{id:'123'}],info:{more_records:true}}:{data:[{id:'124'}],info:{more_records:false}};},onLead:async l=>{if(known.has(l.id))return 'skipped';known.add(l.id);return 'imported';}});
assert.equal((await run()).imported,1);assert.equal((await run()).imported,0);assert.equal(calls,4);
await assert.rejects(fetchIncremental({checkpoint,now,fetchPage:async()=>{throw Error('API unavailable');},onLead:async()=>{}}),/API unavailable/);
console.log('Incremental paging, retry deduplication, CSV ID matching, validation checks passed');
