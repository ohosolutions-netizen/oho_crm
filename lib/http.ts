export async function readJSON(response:Response):Promise<any>{
  const text=await response.text();
  try{if(!text.trim())throw new Error();return JSON.parse(text);}
  catch{throw new Error('The server returned an incomplete response. Refresh records before trying again.');}
}
