import {current} from './context.mjs';
export async function cookies(){const raw=current().req.headers.cookie||'';return {get:(name)=>{const value=raw.split(';').map(p=>p.trim()).find(p=>p.startsWith(name+'='));return value?{value:value.slice(name.length+1)}:undefined;}};}
