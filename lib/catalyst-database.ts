type Command={sql:string;args:unknown[]};
export function catalystDatabase(url:string,token:string):D1Database {
  async function call(commands:Command[]){const response=await fetch(url+'/rpc',{method:'POST',headers:{'Content-Type':'application/json','X-OHO-Backend-Token':token},body:JSON.stringify({commands})});const body=await response.json() as {result:D1Result[];error?:string};if(!response.ok)throw new Error(body.error||'Catalyst backend unavailable.');return body.result;}
  class Statement {
    command:Command;
    constructor(sql:string,args:unknown[]=[]){this.command={sql,args};}
    bind(...args:unknown[]){return new Statement(this.command.sql,args);}
    async all<T>(){return (await call([this.command]))[0] as D1Result<T>;}
    async run<T>(){return this.all<T>();}
    async first<T>(column?:string){const result=(await this.all<T>()).results[0];return column&&result?(result as Record<string,unknown>)[column]:result||null;}
  }
  return {prepare:(sql:string)=>new Statement(sql),batch:(statements:Statement[])=>call(statements.map(s=>s.command))} as unknown as D1Database;
}
