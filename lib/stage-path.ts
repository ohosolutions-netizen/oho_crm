const leadPaths:Record<string,string[]>={
 'New Lead':['Not Contacted','Not Pitched','Discovery to be Scheduled'],
 'Not Contacted':['Not Pitched','Discovery to be Scheduled','Followup Later','Junk Lead','Lead Lost'],
 'Not Pitched':['Discovery to be Scheduled','Followup Later','Junk Lead','Lead Lost'],
 'Followup Later':['Not Contacted','Not Pitched','Discovery to be Scheduled','Junk Lead','Lead Lost'],
 Connected:['Discovery to be Scheduled','Followup Later','Junk Lead','Lead Lost'],
 'Discovery to be Scheduled':['Discovery scheduled','Followup Later','Junk Lead','Lead Lost'],
 'Discovery scheduled':['Discovery completed','Junk Lead','Lead Lost'],
 'Discovery completed':['Converted','Junk Lead','Lead Lost'],
 Converted:[],Disqualified:[],'Junk Lead':[],'Lead Lost':[]
};
const dealPaths:Record<string,string[]>={
 'Solution planning':['Proposal preparation','Closed lost'],
 'Proposal preparation':['Proposal sent','Closed lost'],
 'Proposal sent':['Proposal preparation','Negotiation','Accepted','Closed lost'],
 Negotiation:['Accepted','Closed lost'],Accepted:[],'Closed lost':[]
};
export function allowedNextStages(module:string,current:string){return (module==='enquiries'?leadPaths:dealPaths)[current]||[];}
export function stageMoveAllowed(module:string,current:string,target:string){return allowedNextStages(module,current).includes(target)||(module==='opportunities'&&current==='Proposal sent'&&target===current);}
