'use client';
import {Children,isValidElement,useCallback,useEffect,useRef,useState,type ComponentProps,type ReactNode,type ChangeEvent} from 'react';
import {createPortal} from 'react-dom';
import {ChevronDown,Check,Search} from 'lucide-react';
import {usePopup} from './popup-position';
type Option={value:string;label:string;disabled:boolean};
function text(node:ReactNode):string{return Children.toArray(node).map(n=>isValidElement<{children?:ReactNode}>(n)?text(n.props.children):String(n)).join('');}
function options(node:ReactNode):Option[]{return Children.toArray(node).flatMap(n=>{if(!isValidElement<{children?:ReactNode;value?:string|number;disabled?:boolean}>(n))return [];if(n.type==='option')return [{value:String(n.props.value??text(n.props.children)),label:text(n.props.children),disabled:!!n.props.disabled}];return options(n.props.children);});}
export default function Select(props:ComponentProps<'select'>){
 const all=options(props.children),selected=String(props.value??props.defaultValue??all[0]?.value??''),[open,setOpen]=useState(false),[search,setSearch]=useState(''),[label,setLabel]=useState(props['aria-label']||'Select option'),[highlight,setHighlight]=useState(0);
 const trigger=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null),native=useRef<HTMLSelectElement>(null),searchRef=useRef<HTMLInputElement>(null);
 const close=useCallback(()=>setOpen(false),[]),{position,id}=usePopup(trigger,panel,open,close);
 const filtered=all.filter(o=>o.label.toLowerCase().includes(search.toLowerCase()));
 useEffect(()=>{setLabel(props['aria-label']||native.current?.closest('label')?.querySelector('span')?.textContent?.trim()||'Select option');},[props['aria-label']]);
 useEffect(()=>{if(open){setSearch('');setHighlight(Math.max(0,all.findIndex(o=>o.value===selected)));} },[open]);
 useEffect(()=>{if(open&&all.length>8)searchRef.current?.focus();},[open,all.length]);
 useEffect(()=>{panel.current?.querySelector('[data-highlighted="true"]')?.scrollIntoView({block:'nearest'});},[highlight]);
 function choose(o:Option){if(o.disabled)return;const node=native.current!;node.value=o.value;props.onChange?.({target:node,currentTarget:node} as ChangeEvent<HTMLSelectElement>);close();trigger.current?.focus();}
 function keys(e:React.KeyboardEvent){if(['ArrowDown','ArrowUp','Home','End','Enter'].includes(e.key)){e.preventDefault();e.stopPropagation();if(!open){setOpen(true);return;}if(e.key==='Enter'){const option=filtered[highlight];if(option)choose(option);}else setHighlight(i=>e.key==='Home'?0:e.key==='End'?filtered.length-1:Math.max(0,Math.min(filtered.length-1,i+(e.key==='ArrowDown'?1:-1))));}}
 return <div className={'crm-select '+(props.className||'')}><select {...props} ref={native} tabIndex={-1} className="control-validation" aria-hidden="true" onInvalid={e=>{e.preventDefault();setOpen(true);trigger.current?.focus();}}/><button ref={trigger} type="button" role="combobox" aria-label={label} aria-expanded={open} aria-haspopup="listbox" aria-controls={id} aria-required={props.required} disabled={props.disabled} className={'select-trigger '+(!selected?'placeholder':'')} onClick={()=>setOpen(v=>!v)} onKeyDown={keys}><span>{all.find(o=>o.value===selected)?.label||'Select…'}</span><ChevronDown size={17}/></button>{open&&createPortal(<div ref={panel} className="select-popover" style={{position:'fixed',...position}} onKeyDown={keys}>{all.length>8&&<div className="select-search"><Search size={16}/><input ref={searchRef} aria-label={`Search ${label.replace(' *','')}`} value={search} placeholder="Search options…" onChange={e=>{setSearch(e.target.value);setHighlight(0);}}/></div>}<div role="listbox" id={id} aria-label={label} className="select-options">{filtered.map((o,i)=><button key={o.value} type="button" role="option" aria-selected={o.value===selected} disabled={o.disabled} data-highlighted={i===highlight} className={o.value===selected?'selected':''} onMouseEnter={()=>setHighlight(i)} onClick={()=>choose(o)}><span>{o.label}</span>{o.value===selected&&<Check size={16}/>}</button>)}{!filtered.length&&<p>No matching options</p>}</div></div>,document.body)}</div>;
}
