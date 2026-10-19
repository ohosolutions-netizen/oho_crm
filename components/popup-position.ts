'use client';
import {useEffect,useLayoutEffect,useState,useId,type RefObject} from 'react';
const stack:string[]=[];
export function usePopup(trigger:RefObject<HTMLElement|null>,panel:RefObject<HTMLElement|null>,open:boolean,close:()=>void,width?:number){
 const id=useId(),[position,setPosition]=useState({left:0,top:0,width:width||260});
 useLayoutEffect(()=>{if(!open)return;const place=()=>{const r=trigger.current?.getBoundingClientRect();if(!r)return;const w=Math.min(width||Math.max(r.width,240),innerWidth-24),h=panel.current?.offsetHeight||300;setPosition({left:Math.max(12,Math.min(r.left,innerWidth-w-12)),top:Math.max(12,Math.min(r.bottom+7,innerHeight-h-12)),width:w});};place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};},[open,width,trigger,panel]);
 useEffect(()=>{if(!open)return;stack.push(id);const outside=(e:PointerEvent)=>{if(stack.at(-1)===id&&!trigger.current?.contains(e.target as Node)&&!panel.current?.contains(e.target as Node))close();};const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&stack.at(-1)===id){e.preventDefault();e.stopImmediatePropagation();close();trigger.current?.focus();}};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',key,true);return()=>{const i=stack.indexOf(id);if(i>=0)stack.splice(i,1);document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',key,true);};},[open,id,close,trigger,panel]);
 return {position,id};
}
