// Browser-only test runtime. Production APIs and credentials are not bundled.
import initSqlJs from 'sql.js';
import schema from '../../drizzle/0000_damp_adam_warlock.sql?raw';
import {fullPermissions} from '../../lib/model';
const SQL=await initSqlJs({locateFile:()=>new URL('./sql-wasm.wasm',location.href).href});
const key='oho-catalyst-preview-db-v1',stored=localStorage.getItem(key);
const db=stored?new SQL.Database(Uint8Array.from(atob(stored),c=>c.charCodeAt(0))):new SQL.Database();
function persist(){const bytes=db.export();db.exec('PRAGMA foreign_keys=ON');let str='';for(const byte of bytes)str+=String.fromCharCode(byte);localStorage.setItem(key,btoa(str));}
if(!stored){
  db.exec(schema);
  db.run("INSERT INTO roles VALUES ('admin','Admin',NULL),('manager','Manager','admin'),('executive','Executive','manager')");
  db.run('INSERT INTO profiles VALUES (?,?,?)',['administrator','Administrator',JSON.stringify(fullPermissions())]);
  db.run('INSERT INTO profiles VALUES (?,?,?)',['standard','Standard',JSON.stringify(Object.fromEntries(Object.entries(fullPermissions()).map(([m,p])=>[m,m==='administration'?{view:false,create:false,edit:false,delete:false}:{...p,delete:false}])))]);
  db.run('INSERT INTO users (id,email,name,role_id,profile_id,active) VALUES (?,?,?,?,?,?)',['preview-admin','c8tyvch5hn@privaterelay.appleid.com','Krishna Kumar','admin','administrator',1]);
  persist();
}
db.exec('PRAGMA foreign_keys=ON');
class Statement {
  sql:string;args:unknown[];
  constructor(sql:string,args:unknown[]=[]){this.sql=sql;this.args=args;}
  bind(...args:unknown[]){return new Statement(this.sql,args);}
  execute(){const stmt=db.prepare(this.sql);try{stmt.bind(this.args);const results=[];while(stmt.step())results.push(stmt.getAsObject());return {results,success:true,meta:{changes:db.getRowsModified()}};}finally{stmt.free();}}
  async all<T>(){return this.execute() as D1Result<T>;}
  async run<T>(){const result=this.execute();persist();return result as D1Result<T>;}
}
export const env={DB:{prepare:(sql:string)=>new Statement(sql),batch:async(statements:Statement[])=>{db.exec('BEGIN');try{const result=statements.map(s=>s.execute());db.exec('COMMIT');persist();return result;}catch(e){try{db.exec('ROLLBACK');}catch{}throw e;}}} as unknown as D1Database};
