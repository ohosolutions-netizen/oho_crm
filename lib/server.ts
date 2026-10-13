import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../app/chatgpt-auth';
import { fullPermissions, hasPermission, visibleOwner, type Role, type Member, type PermissionMap, type CRMRecord, type Action } from './model';
export class APIError extends Error { status: number; constructor(message: string, status=400) { super(message); this.status=status; } }
export function database() { if(!env.DB) throw new APIError('Database unavailable. Please retry shortly.',503); return env.DB; }
export async function rows<T>(sql:string,...args: unknown[]):Promise<T[]> { return (await database().prepare(sql).bind(...args).all<T>()).results; }
export async function log(actor:string,action:string,target:string,details:unknown) {
  return database().prepare('INSERT INTO audit (id,actor_id,action,target,details,created_at) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),actor,action,target,JSON.stringify(details),new Date().toISOString());
}
export async function context() {
  const identity=await getChatGPTUser(); if(!identity) throw new APIError('Please sign in.',401);
  const email=identity.email.toLowerCase();
  let members=await rows<Member>('SELECT id,email,name,auth_id AS authId,role_id AS roleId,profile_id AS profileId,active FROM users');
  if(members.length===0) {
    const id=crypto.randomUUID();
    // Owner-private hosting gates first setup; the bootstrap claim is atomic.
    const claimed=await database().prepare("INSERT INTO settings (key,value) VALUES ('bootstrap',?) ON CONFLICT(key) DO NOTHING").bind(identity.userId).run();
    const claim=await rows<{value:string}>("SELECT value FROM settings WHERE key='bootstrap'");
    if(claim[0]?.value!==identity.userId) throw new APIError('Workspace setup is in progress. Retry shortly.',503);
    await database().batch([
      database().prepare("INSERT OR IGNORE INTO roles (id,name,parent_id) VALUES ('admin','Admin',NULL),('manager','Manager','admin'),('executive','Executive','manager')"),
      database().prepare('INSERT OR IGNORE INTO profiles (id,name,permissions) VALUES (?,?,?)').bind('administrator','Administrator',JSON.stringify(fullPermissions())),
      database().prepare('INSERT OR IGNORE INTO profiles (id,name,permissions) VALUES (?,?,?)').bind('standard','Standard',JSON.stringify(Object.fromEntries(Object.entries(fullPermissions()).map(([k,v])=>[k,k==='administration'?{view:false,create:false,edit:false,delete:false}:{...v,delete:false}])))),
      database().prepare('INSERT OR IGNORE INTO users (id,email,name,auth_id,role_id,profile_id,active) VALUES (?,?,?,?,?,?,1)').bind(id,email,identity.displayName,identity.userId,'admin','administrator'),
      ...(claimed.meta.changes?[await log(id,'setup','workspace',{email})]:[]),
    ]);
    members=await rows<Member>('SELECT id,email,name,auth_id AS authId,role_id AS roleId,profile_id AS profileId,active FROM users');
  }
  let me=members.find(u=>u.authId===identity.userId);
  if(!me) {
    const invited=members.find(u=>u.email===email&&!u.authId&&u.active);
    if(invited) {
      await database().prepare('UPDATE users SET auth_id=? WHERE id=? AND auth_id IS NULL').bind(identity.userId,invited.id).run();
      me=(await rows<Member>('SELECT id,email,name,auth_id AS authId,role_id AS roleId,profile_id AS profileId,active FROM users WHERE auth_id=?',identity.userId))[0];
    }
  }
  if(!me?.active) throw new APIError('Your account is not an active OHO CRM member. Ask your administrator to add your sign-in email.',403);
  const roles=await rows<Role>('SELECT id,name,parent_id AS parentId FROM roles');
  const profiles=await rows<{id:string;name:string;permissions:string}>('SELECT * FROM profiles');
  const permissions:PermissionMap=JSON.parse(profiles.find(p=>p.id===me.profileId)?.permissions||'{}');
  return {me,members,roles,profiles,permissions};
}
export type Context=Awaited<ReturnType<typeof context>>;
export function permit(c:Context,module:string,action:Action) { if(!hasPermission(c.permissions,module,action)) throw new APIError('Your profile does not allow this action.',403); }
export function canSee(c:Context,r:CRMRecord) { return hasPermission(c.permissions,r.module,'view')&&visibleOwner(c.me,c.members.find(u=>u.id===r.ownerId),c.roles); }
export async function allRecords():Promise<CRMRecord[]> {
  return (await rows<Omit<CRMRecord,'data'> & {data:string}>('SELECT id,module,title,owner_id AS ownerId,company_id AS companyId,data,created_at AS createdAt,updated_at AS updatedAt FROM records ORDER BY updated_at DESC')).map(r=>({...r,data:JSON.parse(r.data)}));
}
export function errorResponse(error:unknown) { return Response.json({error:error instanceof APIError?error.message:'Unable to complete this request.'},{status:error instanceof APIError?error.status:500,headers:{'Cache-Control':'no-store'}}); }
export function checkOrigin(req:Request) {
  const origin=req.headers.get('origin'); if(origin&&origin!==new URL(req.url).origin) throw new APIError('Invalid request origin.',403);
}
