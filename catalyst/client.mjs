import {createRequire} from 'node:module';
import {join} from 'node:path';
import {readFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
export const config=JSON.parse(await readFile(new URL('./project.json',import.meta.url),'utf8'));
process.env.CATALYST_ACTIVE_DC='in';
// Reuse the user's existing, encrypted Catalyst CLI session on this computer.
// Credentials stay in the CLI store and are never copied into app source.
const cliRoot=process.env.CATALYST_CLI_ROOT||join(process.env.APPDATA,'npm','node_modules','zcatalyst-cli','lib');
const Credential=require(join(cliRoot,'authentication','credential.js')).default;
const cliStore=require(join(cliRoot,'util_modules','config-store.js')).default;
const encrypted=cliStore.get('in.credential');
if(!encrypted)throw new Error('Run catalyst login --dc in on this computer first.');
Credential.init(encrypted);
export async function api(path,method='GET',body){
  const token=await Credential.getAccessToken();
  const res=await fetch(`https://api.catalyst.zoho.in/baas/v1/project/${config.projectId}${path}`,{method,headers:{Authorization:`Zoho-oauthtoken ${token}`,'Catalyst-org':config.organizationId,Environment:config.environment,'X-CATALYST-Environment':config.environment,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  const raw=await res.text();
  // Catalyst IDs exceed JavaScript's safe integer range.
  let payload;try{payload=JSON.parse(raw.replace(/(:\s*)(\d{16,})(?=\s*[,}])/g,'$1"$2"'));}catch{throw new Error(`Catalyst returned an invalid response (${res.status}).`);}
  if(!res.ok||payload.status!=='success')throw new Error(`Catalyst ${payload.data?.error_code||res.status}: ${payload.data?.message||'request failed'}`);
  return payload.data;
}
export async function query(sql){return api('/query','POST',{query:sql});}
export const quote=value=>"'"+String(value).replaceAll('\\','\\\\').replaceAll("'","''")+"'";
export async function rows(table,where='',suffix=''){
  const result=[];let offset=0;
  for(;;){const page=await query(`SELECT * FROM ${table}${where?' WHERE '+where:''}${suffix?' '+suffix:''} LIMIT ${offset},200`);const flat=page.map(r=>r[table]||r);result.push(...flat);if(flat.length<200)break;offset+=200;}
  return result;
}
export async function insert(table,items){return api(`/table/${config.tables[table]}/row`,'POST',items);}
export async function update(table,items){return api(`/table/${config.tables[table]}/row`,'PUT',items);}
if(process.argv.includes('--check')){const result=await api('/table');console.log(JSON.stringify({project:config.projectId,tables:result.length,connected:true}));}

export async function first(table,where='',suffix=''){const page=await query('SELECT * FROM '+table+(where?' WHERE '+where:'')+(suffix?' '+suffix:'')+' LIMIT 0,1');return page[0]?.[table]||page[0]||null;}
