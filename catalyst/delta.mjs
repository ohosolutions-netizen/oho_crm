export const entities=['roles','profiles','users','records','audit','settings'];
export function applyDelta(state,delta){
  if(delta.format!=='oho-delta-v1')throw new Error('Unknown checkpoint format.');
  for(const table of entities){const pk=table==='settings'?'key':'id',upserts=delta.upserts[table]||[],removed=new Set(delta.deletes[table]||[]),byId=new Map(upserts.map(r=>[r[pk],r]));state[table]=state[table].filter(r=>!removed.has(r[pk])).map(r=>{const next=byId.get(r[pk]);if(next){byId.delete(r[pk]);return next;}return r;});state[table].push(...byId.values());}
  return state;
}
export function deltaPayload(after,before,previousRevision){return {format:'oho-delta-v1',baseRevision:previousRevision,upserts:after,deletes:Object.fromEntries(entities.map(table=>{const pk=table==='settings'?'key':'id',current=new Set((after[table]||[]).map(r=>r[pk]));return [table,(before[table]||[]).filter(r=>!current.has(r[pk])).map(r=>r[pk])];}))};}
