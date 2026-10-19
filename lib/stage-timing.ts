import type {CRMRecord} from './model';
export type TimingEvent={recordId:string;fromStage:string;toStage:string;createdAt:string};
export function stageTiming(records:CRMRecord[],events:TimingEvent[],from:string,to:string){
 const start=new Date(from+'T00:00:00+05:30'),previousEnd=new Date(start.getTime()-86400000),previousTo=previousEnd.toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'}),previousFrom=previousTo.slice(0,7)+'-01';
 const grouped=new Map<string,TimingEvent[]>();for(const e of events){if(e.fromStage===e.toStage)continue;grouped.set(e.recordId,[...(grouped.get(e.recordId)||[]),e]);}
 const samples=new Map<string,{current:number[];previous:number[]}>();
 for(const r of records){let stage=r.module==='enquiries'?'New Lead':'Solution planning',entered=Date.parse(r.createdAt);if(r.data.importOrigin&&r.module==='opportunities')entered=NaN;
 for(const e of (grouped.get(r.id)||[]).sort((a,b)=>a.createdAt.localeCompare(b.createdAt))){const at=Date.parse(e.createdAt),day=new Date(at).toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});if(stage===e.fromStage&&Number.isFinite(entered)&&at>=entered){const key=e.fromStage+' → '+e.toStage,period=day>=from&&day<=to?'current':day>=previousFrom&&day<=previousTo?'previous':null;if(period){const bucket=samples.get(key)||{current:[],previous:[]};bucket[period].push(at-entered);samples.set(key,bucket);}}stage=e.toStage;entered=at;}}
 const mean=(v:number[])=>v.length?v.reduce((a,b)=>a+b,0)/v.length:null;
 return {previousFrom,previousTo,rows:[...samples].map(([path,s])=>({path,current:mean(s.current),previous:mean(s.previous),count:s.current.length,previousCount:s.previous.length})).sort((a,b)=>a.path.localeCompare(b.path))};
}
export function duration(ms:number|null){if(ms===null)return 'No data';const hours=Math.floor(ms/3600000);return hours<1?'<1Hr':Math.floor(hours/24)+'D, '+hours%24+'Hr';}
