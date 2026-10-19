import catalyst from 'zcatalyst-sdk-node';
import {requestContext} from '../cloud/context.mjs';
import {runLeadSync} from './runner.mjs';
export default async function handler(jobRequest,context){
 const app=catalyst.initialize(context,{scope:'admin'});
 await requestContext.run({app},async()=>{try{await runLeadSync();context.closeWithSuccess();}catch(e){console.error('Zoho lead sync failed:',e.message);context.closeWithFailure();}});
}
