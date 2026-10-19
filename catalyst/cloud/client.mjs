import {current} from './context.mjs';
import config from '../project.json';
export {config};
export const quote=value=>"'"+String(value).replaceAll('\\','\\\\').replaceAll("'","''")+"'";
export async function rows(table,where='',suffix=''){
  const result=[];let offset=0;
  for(;;){const page=await current().app.zcql().executeZCQLQuery(`SELECT * FROM ${table}${where?' WHERE '+where:''}${suffix?' '+suffix:''} LIMIT ${offset},200`);const flat=page.map(r=>{const row=r[table]||r;if(table==='BackendCommits')for(const key of ['Revision','PreviousRevision','ChunkCount'])row[key]=Number(row[key]);return row;});result.push(...flat);if(flat.length<200)break;offset+=200;}
  return result;
}
export async function insert(table,items){return current().app.datastore().table(config.tables[table]).insertRows(items);}
export async function update(table,items){return current().app.datastore().table(config.tables[table]).updateRows(items);}

export async function first(table,where='',suffix=''){const page=await current().app.zcql().executeZCQLQuery('SELECT * FROM '+table+(where?' WHERE '+where:'')+(suffix?' '+suffix:'')+' LIMIT 0,1');return page[0]?.[table]||page[0]||null;}

export async function query(sql){return current().app.zcql().executeZCQLQuery(sql);}
