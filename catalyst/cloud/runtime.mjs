import {writeDirect,reserveDatabaseChanges,releaseRecords,checkNativeDeletions,markConfiguration,repairCommittedRecords} from '../native-store.mjs';
import {current} from './context.mjs';
import {persistDatabase,persistChanges,entities} from '../state.mjs';
import {sync} from '../projections.mjs';
import {APIError} from '../../lib/server.ts';
class Statement {
  constructor(sql,args=[]){this.sql=sql;this.args=args;}
  bind(...args){return new Statement(this.sql,args);}
  execute(){const stmt=current().db.prepare(this.sql);if(/^\s*SELECT\b/i.test(this.sql))return {results:stmt.all(...this.args),success:true,meta:{changes:0}};const result=stmt.run(...this.args);return {results:[],success:true,meta:{changes:Number(result.changes)}};}
  async all(){return this.execute();}
  async run(){if(/^\s*SELECT\b/i.test(this.sql))return this.execute();return (await batch([this]))[0];}
}
function startTracking(db){
  db.exec('CREATE TEMP TABLE mutation_rows (entity TEXT, row_key TEXT, before_json TEXT, PRIMARY KEY(entity,row_key))');
  for(const table of entities){const keys=db.prepare(`PRAGMA table_info(${table})`).all().map(c=>c.name),pk=table==='settings'?'key':'id';const old=`json_object(${keys.map(k=>`'${k}',OLD.${k}`).join(',')})`;
    for(const event of ['INSERT','UPDATE','DELETE'])db.exec(`CREATE TEMP TRIGGER track_${table}_${event} AFTER ${event} ON ${table} BEGIN INSERT OR IGNORE INTO mutation_rows VALUES ('${table}',${event==='INSERT'?'NEW':'OLD'}.${pk},${event==='INSERT'?'NULL':old}); END`);
  }
}
function finishTracking(db){for(const table of entities)for(const event of ['INSERT','UPDATE','DELETE'])db.exec(`DROP TRIGGER IF EXISTS track_${table}_${event}`);db.exec('DROP TABLE IF EXISTS mutation_rows');}
async function batch(statements){
  const c=current();let leases=[],published=false;startTracking(c.db);c.db.exec('BEGIN IMMEDIATE');
  try{
    const result=statements.map(s=>s.execute()),before=Object.fromEntries(entities.map(t=>[t,[]])),after=Object.fromEntries(entities.map(t=>[t,[]]));let changed=false;
    for(const row of c.db.prepare('SELECT * FROM mutation_rows').all()){const old=row.before_json?JSON.parse(row.before_json):null,next=c.db.prepare(`SELECT * FROM ${row.entity} WHERE ${row.entity==='settings'?'key':'id'}=?`).get(row.row_key);if(JSON.stringify(old)!==JSON.stringify(next||null)){changed=true;if(old)before[row.entity].push(old);if(next)after[row.entity].push({...next});}}
    if(changed&&!c.direct){leases=await reserveDatabaseChanges(c.db,before,after);await checkNativeDeletions(before,after);}
    if(changed&&c.direct)await writeDirect(after,before,c.nativeRegistry,c.db);
    const configuration=['roles','profiles','users'].some(t=>after[t].length||before[t].length);if(changed&&!c.direct){const commit=c.revision%100===0?await persistDatabase(c.db,c.revision,configuration):await persistChanges(after,before,c.revision);c.revision=commit.Revision;published=true;}c.db.exec('COMMIT');
    if(changed){c.changedRecordIds||=new Set();for(const r of [...after.records,...before.records])c.changedRecordIds.add(r.id);}
    if(changed&&!c.direct)try{await sync(after,before);if(configuration)await markConfiguration(c.revision);}catch(e){console.error('Projection reconciliation required:',e.message);c.projectionPending=true;await repairCommittedRecords(after,leases);}
    await releaseRecords(leases);return result;
  }catch(e){if(!published)await releaseRecords(leases).catch(()=>{});try{c.db.exec('ROLLBACK');}catch{}if(e.status===409)throw new APIError(e.message,409);if(e.status)throw new APIError(e.message,e.status);throw e;}
  finally{finishTracking(c.db);}
}
export const env={DB:{prepare:sql=>new Statement(sql),batch}};
