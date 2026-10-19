'use client';
import {useState} from 'react';
import {Upload,FileText,Check} from 'lucide-react';
export default function ProposalUpload({opportunityId,name,disabled,change,pending}:{opportunityId:string;name:string;disabled:boolean;change:(id:string,name:string)=>void;pending:(busy:boolean)=>void}){
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function upload(file?:File){if(!file)return;setError('');change('','');if(file.size>5*1024*1024){setError('Choose a document up to 5 MB.');return;}setBusy(true);pending(true);try{const res=await fetch('/api/documents?opportunityId='+encodeURIComponent(opportunityId),{method:'POST',headers:{'Content-Type':'application/octet-stream','X-OHO-Filename':encodeURIComponent(file.name)},body:file});const body=await res.json() as {id:string;name:string;error?:string};if(!res.ok)throw new Error(body.error||'Unable to upload document.');change(body.id,body.name);}catch(e){setError(e instanceof Error?e.message:'Upload failed.');}finally{setBusy(false);pending(false);}}
 return <div className="proposal-upload"><span className="upload-label">Proposal document <em>*</em></span><label className={'proposal-dropzone '+(name?'uploaded':'')}><input type="file" aria-label="Upload proposal document" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" disabled={disabled||busy} onChange={e=>upload(e.target.files?.[0])}/>{name?<Check size={21}/>:busy?<FileText size={21}/>:<Upload size={21}/>}<span><strong>{busy?'Uploading…':name||'Choose proposal document'}</strong><small>PDF, Word, Excel or PowerPoint · up to 5 MB</small></span></label>{error&&<p role="alert" className="danger">{error}</p>}<p className="form-note">Saved as a new revision; earlier proposals are retained.</p></div>;
}

