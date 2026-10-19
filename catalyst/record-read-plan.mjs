// Detail reads need the selected record and its activities, never whole module tables.
export function recordReadWhere(module,id,quote){
 const selected='AppId='+quote(id);
 return (module==='activities'?'('+selected+' OR LeadAppId='+quote(id)+' OR OpportunityAppId='+quote(id)+')':selected)+' AND IsDeleted=false';
}
