import {AsyncLocalStorage} from 'node:async_hooks';
export const requestContext=new AsyncLocalStorage();
export const current=()=>{const value=requestContext.getStore();if(!value)throw new Error('Missing request context');return value;};
