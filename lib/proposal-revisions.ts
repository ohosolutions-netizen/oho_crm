import type {CRMRecord} from './model';
export function proposalVersions(opportunityId:string,records:CRMRecord[]){return records.filter(r=>r.module==='proposals'&&r.data.opportunityId===opportunityId).sort((a,b)=>Number(b.data.version)-Number(a.data.version));}
export function acceptedRevision(opportunityId:string,id:string,records:CRMRecord[]){return proposalVersions(opportunityId,records).find(r=>r.id===id&&['Sent','Negotiating','Accepted'].includes(r.data.status));}
export function nextProposalVersion(opportunityId:string,records:CRMRecord[]){return String(Math.max(0,...proposalVersions(opportunityId,records).map(r=>Number(r.data.version)||0))+1);}
export function documentUrl(id:string){return 'https://oho-crm-60091125992.development.catalystserverless.in/server/ohocrm/api/documents?id='+encodeURIComponent(id);}
export function proposalLabel(p:CRMRecord){const version=p.data.version;const title=p.title.replace(/\s*[·\-–]\s*v\d+\s*$/i,'').trim();return `Revision ${version}`+(/^v\d+$/i.test(title)||!title?'':` · ${title}`);}
