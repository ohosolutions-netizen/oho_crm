import { env } from 'cloudflare:workers';
import { cookies } from 'next/headers';
import { catalystDatabase } from './catalyst-database';
import { fullPermissions, hasPermission, visibleOwner, normalizeData, type Role, type Member, type PermissionMap, type CRMRecord, type Action } from './model';
export class APIError extends Error { status: number; constructor(message: string, status=400) { super(message); this.status=status; } }
export function database() { const local=env as typeof env & {OHO_CATALYST_URL?:string;OHO_CATALYST_TOKEN?:string};if(local.OHO_CATALYST_URL&&local.OHO_CATALYST_TOKEN)return catalystDatabase(local.OHO_CATALYST_URL,local.OHO_CATALYST_TOKEN);if(!env.DB) throw new APIError('Database unavailable. Please retry shortly.',503); return env.DB; }
export async function rows<T>(sql:string,...args: unknown[]):Promise<T[]> { return (await database().prepare(sql).bind(...args).all<T>()).results; }
export async function log(actor:string,action:string,target:string,details:unknown) {
  return database().prepare('INSERT INTO audit (id,actor_id,action,target,details,created_at) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),actor,action,target,JSON.stringify(details),new Date().toISOString());
}
export const SESSION_COOKIE='oho_crm_session';
const encoder=new TextEncoder();
function base64url(bytes:Uint8Array){let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
async function digest(value:string){return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))));}
async function passwordHash(password:string,salt:string){
  const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:encoder.encode(salt),iterations:210000},key,256);
  return base64url(new Uint8Array(bits));
}
type PasswordResetEmail={to:string;name:string;url:string;expiresMinutes:number};
let passwordResetEmailSender:((message:PasswordResetEmail)=>Promise<void>)|null=null;
export function configurePasswordResetEmailSender(sender:(message:PasswordResetEmail)=>Promise<void>){passwordResetEmailSender=sender;}
function safeEqual(left:string,right:string){if(left.length!==right.length)return false;let result=0;for(let i=0;i<left.length;i++)result|=left.charCodeAt(i)^right.charCodeAt(i);return result===0;}
export function validPassword(value:unknown):string {
  if(typeof value!=='string'||value.length<8||value.length>128) throw new APIError('Password must be between 8 and 128 characters.');
  return value;
}
export function validEmail(value:unknown):string {
  if(typeof value!=='string'||value.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) throw new APIError('Enter a valid email address.');
  return value.trim().toLowerCase();
}
async function membersWithBootstrap(email?:string) {
  let members=await rows<Member>('SELECT id,email,name,auth_id AS authId,role_id AS roleId,profile_id AS profileId,active FROM users');
  if(members.length===0) {
    if(!email) throw new APIError('Sign in to continue.',401);
    const id=crypto.randomUUID();
    const claimed=await database().prepare("INSERT INTO settings (key,value) VALUES ('email_bootstrap',?) ON CONFLICT(key) DO NOTHING").bind(email).run();
    const claim=await rows<{value:string}>("SELECT value FROM settings WHERE key='email_bootstrap'");
    if(claim[0]?.value!==email) throw new APIError('Workspace setup is in progress. Retry shortly.',503);
    await database().batch([
      database().prepare("INSERT OR IGNORE INTO roles (id,name,parent_id) VALUES ('admin','Admin',NULL),('manager','Manager','admin'),('executive','Executive','manager')"),
      database().prepare('INSERT OR IGNORE INTO profiles (id,name,permissions) VALUES (?,?,?)').bind('administrator','Administrator',JSON.stringify(fullPermissions())),
      database().prepare('INSERT OR IGNORE INTO profiles (id,name,permissions) VALUES (?,?,?)').bind('standard','Standard',JSON.stringify(Object.fromEntries(Object.entries(fullPermissions()).map(([k,v])=>[k,k==='administration'?{view:false,create:false,edit:false,delete:false}:{...v,delete:false}])))),
      database().prepare('INSERT OR IGNORE INTO users (id,email,name,role_id,profile_id,active) VALUES (?,?,?,?,?,1)').bind(id,email,email.split('@')[0],'admin','administrator'),
      ...(claimed.meta.changes?[await log(id,'setup','workspace',{email})]:[]),
    ]);
    members=await rows<Member>('SELECT id,email,name,auth_id AS authId,role_id AS roleId,profile_id AS profileId,active FROM users');
  }
  return members;
}
export async function authenticate(emailValue:unknown,passwordValue:unknown,setup=false,confirmation?:unknown) {
  const email=validEmail(emailValue),password=validPassword(passwordValue);
  const members=await membersWithBootstrap(email);
  const me=members.find(u=>u.email===email);
  if(!me?.active) throw new APIError('This user ID or email is not an active CRM user. Ask your administrator to add it.',403);
  const passwordKey=`password:${me.id}`;
  let saved=(await rows<{value:string}>('SELECT value FROM settings WHERE key=?',passwordKey))[0]?.value;
  if(!saved&&!setup) throw new APIError('Create your password to activate this account.',409);
  if(!saved){
    if(password!==confirmation) throw new APIError('Passwords do not match.');
    const salt=base64url(crypto.getRandomValues(new Uint8Array(18))),hash=await passwordHash(password,salt);
    await database().prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO NOTHING').bind(passwordKey,JSON.stringify({salt,hash})).run();
    saved=(await rows<{value:string}>('SELECT value FROM settings WHERE key=?',passwordKey))[0]?.value;
  }
  let credential:{salt:string;hash:string};try{credential=JSON.parse(saved||'{}');}catch{throw new APIError('Account password configuration is invalid. Ask an administrator to reset it.',500);}
  const candidate=await passwordHash(password,credential.salt||'');
  if(!credential.hash||!safeEqual(candidate,credential.hash)) throw new APIError('Incorrect email or password.',401);
  const token=base64url(crypto.getRandomValues(new Uint8Array(32))),expiresAt=Date.now()+30*24*60*60*1000;
  await database().prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(`session:${await digest(token)}`,JSON.stringify({userId:me.id,expiresAt})).run();
  await log(me.id,setup?'password_created':'sign_in',me.id,{email:me.email});
  return {me,token};
}
export async function requestPasswordReset(emailValue:unknown,baseUrl:string) {
  const email=validEmail(emailValue),members=await rows<Member>('SELECT id,email,name,auth_id AS authId,role_id AS roleId,profile_id AS profileId,active FROM users'),me=members.find(u=>u.email===email&&u.active);
  // Always return the same result so this endpoint cannot be used to enumerate CRM users.
  if(!me)return;
  if(!passwordResetEmailSender)throw new APIError('Password reset email is not configured. Ask your administrator.',503);
  const existing=await rows<{value:string}>('SELECT value FROM settings WHERE key LIKE ?',`password-reset:%`);
  const recent=existing.some(row=>{try{const value=JSON.parse(row.value);return value.userId===me.id&&Number(value.requestedAt)>Date.now()-60000&&Number(value.expiresAt)>Date.now();}catch{return false;}});
  if(recent)return;
  const token=base64url(crypto.getRandomValues(new Uint8Array(32))),key=`password-reset:${await digest(token)}`,requestedAt=Date.now(),expiresAt=requestedAt+30*60*1000;
  await database().batch([
    database().prepare("DELETE FROM settings WHERE key LIKE 'password-reset:%' AND json_extract(value,'$.userId')=?").bind(me.id),
    database().prepare('INSERT INTO settings (key,value) VALUES (?,?)').bind(key,JSON.stringify({userId:me.id,email:me.email,requestedAt,expiresAt})),
  ]);
  const url=new URL('/app/index.html',baseUrl);url.searchParams.set('reset',token);
  try{await passwordResetEmailSender({to:me.email,name:me.name,url:url.toString(),expiresMinutes:30});}
  catch(error){await database().prepare('DELETE FROM settings WHERE key=?').bind(key).run();throw new APIError('Unable to send the reset email. Ask your administrator to verify the CRM email sender.',503);}
  await (await log(me.id,'password_reset_requested',me.id,{email:me.email})).run();
}
export async function completePasswordReset(tokenValue:unknown,passwordValue:unknown,confirmation:unknown) {
  if(typeof tokenValue!=='string'||tokenValue.length<32||tokenValue.length>200)throw new APIError('This password reset link is invalid or expired.',400);
  const password=validPassword(passwordValue);if(password!==confirmation)throw new APIError('Passwords do not match.');
  const key=`password-reset:${await digest(tokenValue)}`,raw=(await rows<{value:string}>('SELECT value FROM settings WHERE key=?',key))[0]?.value;
  let reset:{userId?:string;email?:string;expiresAt?:number}={};try{reset=JSON.parse(raw||'{}');}catch{}
  if(!reset.userId||!reset.expiresAt||reset.expiresAt<Date.now()){if(raw)await database().prepare('DELETE FROM settings WHERE key=?').bind(key).run();throw new APIError('This password reset link is invalid or expired.',400);}
  const members=await rows<Member>('SELECT id,email,name,auth_id AS authId,role_id AS roleId,profile_id AS profileId,active FROM users'),me=members.find(user=>user.id===reset.userId&&user.active);
  if(!me)throw new APIError('This CRM user is inactive. Ask your administrator for access.',403);
  const salt=base64url(crypto.getRandomValues(new Uint8Array(18))),hash=await passwordHash(password,salt);
  await database().batch([
    database().prepare('DELETE FROM settings WHERE key=?').bind(key),
    database().prepare("DELETE FROM settings WHERE key LIKE 'session:%' AND json_extract(value,'$.userId')=?").bind(me.id),
    database().prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(`password:${me.id}`,JSON.stringify({salt,hash})),
    await log(me.id,'password_reset_completed',me.id,{email:me.email}),
  ]);
  return me;
}
export async function revokeSession(token?:string){if(token)await database().prepare('DELETE FROM settings WHERE key=?').bind(`session:${await digest(token)}`).run();}
export async function context() {
  const token=(await cookies()).get(SESSION_COOKIE)?.value;
  if(!token) throw new APIError('Sign in to continue.',401);
  const raw=(await rows<{value:string}>('SELECT value FROM settings WHERE key=?',`session:${await digest(token)}`))[0]?.value;
  let session:{userId?:string;expiresAt?:number}={};try{session=JSON.parse(raw||'{}');}catch{}
  if(!session.userId||!session.expiresAt||session.expiresAt<Date.now()){if(raw)await revokeSession(token);throw new APIError('Your session has expired. Sign in again.',401);}
  const members=await membersWithBootstrap();
  const me=members.find(u=>u.id===session.userId);
  if(!me?.active) throw new APIError('This CRM user is inactive. Ask your administrator for access.',403);
  const roles=await rows<Role>('SELECT id,name,parent_id AS parentId,share_peers AS sharePeers FROM roles');
  const profiles=await rows<{id:string;name:string;permissions:string}>('SELECT * FROM profiles');
  const permissions:PermissionMap=JSON.parse(profiles.find(p=>p.id===me.profileId)?.permissions||'{}');
  return {me,members,roles,profiles,permissions};
}
export type Context=Awaited<ReturnType<typeof context>>;
export function permit(c:Context,module:string,action:Action) { if(!hasPermission(c.permissions,module,action)) throw new APIError('Your profile does not allow this action.',403); }
export function canSee(c:Context,r:CRMRecord) { return hasPermission(c.permissions,r.module,'view')&&visibleOwner(c.me,c.members.find(u=>u.id===r.ownerId),c.roles); }
export async function allRecords(where='',args:unknown[]=[],suffix=''):Promise<CRMRecord[]> {
  return (await rows<Omit<CRMRecord,'data'> & {data:string}>('SELECT id,module,title,owner_id AS ownerId,company_id AS companyId,data,created_at AS createdAt,updated_at AS updatedAt FROM records'+(where?' WHERE '+where:'')+' ORDER BY updated_at DESC'+(suffix?' '+suffix:''),...args)).map(r=>({...r,data:normalizeData(r.module,JSON.parse(r.data))}));
}
export function errorResponse(error:unknown) { return Response.json({error:error instanceof APIError?error.message:'Unable to complete this request.'},{status:error instanceof APIError?error.status:500,headers:{'Cache-Control':'no-store'}}); }
export function checkOrigin(req:Request) {
  const origin=req.headers.get('origin'); if(origin&&origin!==new URL(req.url).origin) throw new APIError('Invalid request origin.',403);
}
