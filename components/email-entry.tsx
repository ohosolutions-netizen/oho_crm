'use client';
import { useState, type FormEvent } from 'react';
import { ArrowRight, Mail, AlertCircle, LockKeyhole } from 'lucide-react';

type Reply={error?:string;setupRequired?:boolean;message?:string};
export default function EmailEntry({error,onEntered}:{error:string;onEntered:()=>Promise<void>}) {
  const resetToken=typeof window==='undefined'?'':new URLSearchParams(window.location.search).get('reset')||'';
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirmPassword,setConfirmPassword]=useState(''),[setup,setSetup]=useState(false),[forgot,setForgot]=useState(false),[resetting,setResetting]=useState(!!resetToken),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  async function submit(event:FormEvent) {
    event.preventDefault();setBusy(true);setMessage('');
    try {
      const payload=resetting?{action:'reset-password',token:resetToken,password,confirmPassword}:forgot?{action:'request-reset',email}:{email,password,confirmPassword,setup};
      const r=await fetch('/api/identity',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),body=await r.json() as Reply;
      if(body.setupRequired){setSetup(true);setMessage('This is your first sign-in. Confirm the password to activate your account.');return;}
      if(!r.ok)throw new Error(body.error||'Unable to complete this request.');
      if(forgot){setMessage(body.message||'If this is an active CRM account, a password reset link has been sent.');return;}
      if(resetting){history.replaceState(null,'',location.pathname);setResetting(false);setPassword('');setConfirmPassword('');setMessage(body.message||'Password updated. Sign in with your new password.');return;}
      await onEntered();
    }catch(e){setMessage(e instanceof Error?e.message:'Unable to complete this request.');}finally{setBusy(false);}
  }
  const title=resetting?'Choose a new password.':forgot?'Reset your password.':setup?'Create your password.':'Welcome back.';
  const description=resetting?'Enter and confirm your new private password.':forgot?'Enter your active CRM email to receive a secure reset link.':setup?'Confirm the private password you want to use for this account.':'Sign in with your active CRM email and password.';
  return <main className="email-entry"><div className="entry-brand"><div className="brand-mark">oho<span>.</span></div><span>SOLUTIONS CRM</span></div><section className="entry-card"><span className="eyebrow">YOUR CUSTOMER WORKSPACE</span><h1>{title}</h1><p>{description}</p><form onSubmit={submit}>{!resetting&&<><label htmlFor="entry-email">Email</label><div className="entry-input"><Mail size={18}/><input id="entry-email" type="email" autoComplete="username" placeholder="Work email" required maxLength={254} autoFocus value={email} disabled={busy||setup} onChange={e=>setEmail(e.target.value)}/></div></>}{!forgot&&<><label htmlFor="entry-password">{resetting?'New password':'Password'}</label><div className="entry-input"><LockKeyhole size={18}/><input id="entry-password" type="password" autoComplete={setup||resetting?'new-password':'current-password'} placeholder="Minimum 8 characters" required minLength={8} maxLength={128} value={password} disabled={busy} onChange={e=>setPassword(e.target.value)}/></div>{!setup&&!resetting&&<button className="entry-forgot" type="button" onClick={()=>{setForgot(true);setMessage('');}}>Forgot password?</button>}{(setup||resetting)&&<><label htmlFor="entry-confirm">Confirm password</label><div className="entry-input"><LockKeyhole size={18}/><input id="entry-confirm" type="password" autoComplete="new-password" placeholder="Enter the same password again" required minLength={8} maxLength={128} value={confirmPassword} disabled={busy} onChange={e=>setConfirmPassword(e.target.value)}/></div></>}</>}{(message||error)&&<div className="error-banner" role="alert"><AlertCircle size={15}/>{message||error}</div>}<button className="primary" disabled={busy} type="submit">{busy?'Please wait…':forgot?'Send reset link':resetting?'Update password':setup?'Create password & sign in':'Sign in'}<ArrowRight size={16}/></button>{forgot&&<button className="entry-back" type="button" disabled={busy} onClick={()=>{setForgot(false);setMessage('');}}>Back to sign in</button>}</form><small>Individual password access · Do not share your password</small></section><p className="entry-footnote">Password reset links expire after 30 minutes and can be used only once.</p></main>;
}
