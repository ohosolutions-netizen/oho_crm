// Deluge Map.toString may emit raw control characters inside quoted values.
// Escape only those characters; parsed field values retain their original text.
export function parseFunctionOutput(output){
 if(typeof output!=='string')throw Error('CRM function did not return a string');
 let quoted=false,escaped=false,text='';
 for(const c of output){if(quoted){if(escaped){text+=c;escaped=false;continue;}if(c==='\\'){text+=c;escaped=true;continue;}if(c==='"'){quoted=false;text+=c;continue;}if(c.charCodeAt(0)<32){text+='\\u'+c.charCodeAt(0).toString(16).padStart(4,'0');continue;}}else if(c==='"')quoted=true;text+=c;}
 const result=JSON.parse(text);if(result.error)throw Error(result.error);if(!Array.isArray(result.data)||typeof result.more_records!=='boolean'||!Number.isFinite(Date.parse(result.sync_until)))throw Error('Incomplete CRM function response');return result;
}
