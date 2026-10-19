import {api,config} from './client.mjs';
import {writeFile} from 'node:fs/promises';
const schemas={};
for(const[name,id]of Object.entries(config.tables))schemas[name]=await api(`/table/${id}/column`);
await writeFile(new URL('./schema.json',import.meta.url),JSON.stringify(schemas,null,2));
console.log(`Verified ${Object.keys(schemas).length} table schemas, ${Object.values(schemas).flat().length} columns.`);
