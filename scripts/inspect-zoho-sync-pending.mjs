import {config,rows,quote} from '../catalyst/client.mjs';
import {decodeNativePayload} from '../catalyst/native-record-codec.mjs';

config.environment=process.argv.includes('--production')?'Production':'Development';
async function payload(row){const header=JSON.parse(row.DataJson);if(!header.bodyRef)return header;const chunks=await rows('BackendChunks',`CommitAppId=${quote(header.bodyRef)}`);return decodeNativePayload(row.DataJson,chunks);}
const result=[];
for(const row of await rows('Settings',"SettingKey LIKE 'zoho-sync:pending:*' AND IsDeleted=false")){
 const frame=await payload(row),item=JSON.parse(frame.value);
 const phoneFields=Object.fromEntries(Object.entries(item.lead||{}).filter(([key,value])=>/(phone|mobile|whatsapp)/i.test(key)&&value));
 result.push({key:row.SettingKey,reason:item.reason,queuedAt:item.queuedAt,id:item.lead?.id,name:item.lead?.Full_Name||item.lead?.Lead_Name||[item.lead?.First_Name,item.lead?.Last_Name].filter(Boolean).join(' '),phone:item.lead?.Phone||'',phoneFields,createdTime:item.lead?.Created_Time||'',owner:item.lead?.Owner?.name||''});
}
console.log(JSON.stringify({environment:config.environment,count:result.length,records:result},null,2));
