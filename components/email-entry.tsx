'use client';
import { useState, type FormEvent } from 'react';
import { ArrowRight, Mail, AlertCircle } from 'lucide-react';
export default function EmailEntry({error,onEntered}:{error:string;onEntered:()=>Promise<void>}) {
  const [email,setEmail]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  async function submit(event:FormEvent) {
    event.preventDefault();setBusy(true);setMessage('');
    try {const r=await fetch('/api/identity',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});const body=await r.json() as {error?:string};if(!r.ok)throw new Error(body.error||'Unable to open workspace.');await onEntered();}catch(e){setMessage(e instanceof Error?e.message:'Unable to open workspace.');}finally{setBusy(false);}
  }
  return <main className="email-entry"><div className="entry-brand"><div className="brand-mark">oho<span>.</span></div><span>SOLUTIONS CRM</span></div><section className="entry-card"><span className="eyebrow">YOUR CUSTOMER WORKSPACE</span><h1>Let’s get to work.</h1><p>Enter your user ID or email to open OHO CRM.</p><form onSubmit={submit}><label htmlFor="entry-email">User ID or email</label><div className="entry-input"><Mail size={18}/><input id="entry-email" type="text" autoComplete="username" placeholder="User ID or work email" required maxLength={254} autoFocus value={email} disabled={busy} onChange={e=>setEmail(e.target.value)}/></div>{(message||error)&&error!=='Enter your email to continue.'&&<div className="error-banner" role="alert"><AlertCircle size={15}/>{message||error}</div>}{message&&error==='Enter your email to continue.'&&<div className="error-banner" role="alert">{message}</div>}<button className="primary" disabled={busy} type="submit">{busy?'Opening workspace…':'Continue'}<ArrowRight size={16}/></button></form><small>Email-only access · No password or verification required</small></section><p className="entry-footnote">Use an active user assigned in Administration.</p></main>;
}
