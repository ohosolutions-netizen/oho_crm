export async function cookies(){return {get:(name:string)=>{const value=localStorage.getItem(name);return value?{value:encodeURIComponent(value)}:undefined;}};}
