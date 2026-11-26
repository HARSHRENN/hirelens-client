import { useLayoutEffect, useRef } from 'react'
import { TEMPLATE_FIELDS } from '../../shared/communication.js'
import { Select } from './ui'
// Plain typing plus named personalisation chips; saved templates stay compatible with existing data.
function read(node: Node): string {
 if (node.nodeType === Node.TEXT_NODE) return node.textContent || ''
 const el = node as HTMLElement
 if (el.dataset?.field) return `{{${el.dataset.field}}}`
 if (el.tagName === 'BR') return '\n'
 const text = Array.from(node.childNodes).map(read).join('')
 return ['DIV','P'].includes(el.tagName) && el.previousSibling ? '\n'+text : text
}
function chip(field: string) {
 const span = document.createElement('span')
 span.dataset.field=field; span.contentEditable='false'; span.className='template-token'
 span.textContent=TEMPLATE_FIELDS[field] || field
 return span
}
export function TemplateText({value,onChange,label,disabled=false}: {value:string;onChange:(value:string)=>void;label:string;disabled?:boolean}) {
 const ref=useRef<HTMLDivElement>(null), selection=useRef<Range|null>(null)
 const remember=()=>{const s=window.getSelection();if(s?.rangeCount && ref.current?.contains(s.anchorNode))selection.current=s.getRangeAt(0).cloneRange()}
 useLayoutEffect(()=>{
  const el=ref.current;if(!el || read(el)===value)return
  el.replaceChildren();let last=0
  for(const m of value.matchAll(/\{\{\s*(\w+)\s*\}\}/g)){
   el.append(document.createTextNode(value.slice(last,m.index)),chip(m[1]!));last=m.index!+m[0].length
  }
  el.append(document.createTextNode(value.slice(last)));selection.current=null
 },[value])
 const insert=(field:string)=>{
  const el=ref.current;if(!el||!field)return
  el.focus();const range=selection.current && el.contains(selection.current.commonAncestorContainer)?selection.current:document.createRange()
  if(!selection.current || !el.contains(range.commonAncestorContainer)){range.selectNodeContents(el);range.collapse(false)}
  range.deleteContents();const token=chip(field);range.insertNode(token);range.setStartAfter(token);range.collapse(true)
  const s=window.getSelection();s?.removeAllRanges();s?.addRange(range);remember();onChange(read(el))
 }
 return <div className="stack" style={{gap:8}}>
  <div ref={ref} className="textarea template-editor" style={label.toLowerCase().includes('subject')?{minHeight:52}:undefined} role="textbox" aria-label={label} aria-multiline="true" aria-disabled={disabled} contentEditable={!disabled} suppressContentEditableWarning onInput={()=>{if(ref.current)onChange(read(ref.current));remember()}} onKeyUp={remember} onMouseUp={remember} onBlur={remember}
   onPaste={e=>{e.preventDefault();const text=e.clipboardData.getData('text/plain'),el=ref.current,s=window.getSelection();if(!el||!s?.rangeCount)return;const r=s.getRangeAt(0);r.deleteContents();const n=document.createTextNode(text);r.insertNode(n);r.setStartAfter(n);r.collapse(true);s.removeAllRanges();s.addRange(r);onChange(read(el));remember()}} />
  <Select aria-label={`Personalise ${label.toLowerCase()}`} disabled={disabled} value="" onChange={e=>insert(e.target.value)} options={[{value:'',label:'Insert a personal detail (optional)'},...Object.entries(TEMPLATE_FIELDS).map(([value,label])=>({value,label:String(label)}))]} />
  <span className="xs muted">Write normally. Named chips fill in the right details for each candidate.</span>
 </div>
}
