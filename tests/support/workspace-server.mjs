import {normalizeData,hasPermission,visibleOwner} from '../../lib/model.ts';
let db;export function install(value){db=value;}
export class APIError extends Error{constructor(message,status=400){super(message);this.status=status;}}
export async function rows(sql,...args){return db.prepare(sql).all(...args);}
export async function allRecords(where='',args=[],suffix=''){return db.prepare('SELECT id,module,title,owner_id AS ownerId,company_id AS companyId,data,created_at AS createdAt,updated_at AS updatedAt FROM records'+(where?' WHERE '+where:'')+' ORDER BY updated_at DESC '+suffix).all(...args).map(r=>({...r,data:normalizeData(r.module,JSON.parse(r.data))}));}
export function canSee(c,r){return hasPermission(c.permissions,r.module,'view')&&visibleOwner(c.me,c.members.find(u=>u.id===r.ownerId),c.roles);}
