// Record details read only direct relationships and their referenced parents.
export function recordReadWhere(module,id,quote,selectedModule){
 const conditions=['AppId='+quote(id)];
 if(module==='activities')conditions.push('LeadAppId='+quote(id),'OpportunityAppId='+quote(id));
 if(['proposals','projects'].includes(module))conditions.push('OpportunityAppId='+quote(id));
 if(module==='opportunities')conditions.push('LeadAppId='+quote(id));
 if(module==='invoices')conditions.push('ProposalAppId='+quote(id));
 if(selectedModule==='companies'&&module!=='companies')conditions.push('CompanyAppId='+quote(id));
 return '('+conditions.join(' OR ')+') AND IsDeleted=false';
}
