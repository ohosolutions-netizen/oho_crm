import React from 'react';
import {createRoot} from 'react-dom/client';
import CRM from '../../app/crm';
import '../../app/globals.css';
const nativeFetch=window.fetch.bind(window);
window.fetch=((input:RequestInfo|URL,options?:RequestInit)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.href);
  if(url.origin===location.origin&&['/api/crm','/api/identity','/api/documents'].includes(url.pathname))return nativeFetch('/server/ohocrm'+url.pathname+url.search,{...options,credentials:'same-origin'});
  return nativeFetch(input,options);
}) as typeof window.fetch;
createRoot(document.getElementById('root')!).render(<CRM/>);
