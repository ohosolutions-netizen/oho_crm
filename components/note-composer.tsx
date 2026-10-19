 'use client';
import {useState,type FormEvent} from 'react';
import type {CRMRecord} from '../lib/model';
export default function NoteComposer({record,save,editable}:{record:CRMRecord;save:(p:Record<string,unknown>)=>Promise<unknown>;editable:boolean}){
 const [note,setNote]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{await save({kind:'note',operation:'edit',id:record.id,expectedUpdatedAt:record.updatedAt,data:{note}});setNote('');}catch(e){setError(e instanceof Error?e.message:'Unable to add note.');}finally{setBusy(false);}}
 if(!editable)return null;
 return <section className="detail-section note-composer"><form onSubmit={submit}><label className="note-composer-label"><span>Add a note</span><textarea aria-label="Add a note" required maxLength={10000} rows={2} value={note} disabled={busy} onChange={e=>setNote(e.target.value)} placeholder="Record a conversation or update…"/></label>{error&&<p role="alert" className="error-banner">{error}</p>}<div className="note-composer-footer"><small className="subtle">Saved notes appear in Timeline.</small><button type="submit" className="primary" disabled={busy||!note.trim()}>{busy?'Saving…':'Add note'}</button></div></form></section>;
}
