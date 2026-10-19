'use client';
import {useCallback,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {MoreHorizontal,Pencil,Trash2} from 'lucide-react';
import {usePopup} from './popup-position';
export default function RecordActions({edit,remove}:{edit?:()=>void;remove?:()=>void}){
 const [open,setOpen]=useState(false),trigger=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null),close=useCallback(()=>setOpen(false),[]),{position,id}=usePopup(trigger,panel,open,close,190);
 if(!edit&&!remove)return null;
 return <><button ref={trigger} className="icon-button" aria-label="Record actions" aria-haspopup="menu" aria-expanded={open} onClick={()=>setOpen(v=>!v)}><MoreHorizontal size={22}/></button>{open&&createPortal(<div id={id} ref={panel} role="menu" aria-label="Record actions" className="record-action-menu" style={{position:'fixed',...position}}>{edit&&<button role="menuitem" onClick={()=>{close();edit();}}><Pencil size={16}/>Edit record</button>}{remove&&<button role="menuitem" className="danger" onClick={()=>{close();remove();}}><Trash2 size={16}/>Delete record</button>}</div>,document.body)}</>;
}
