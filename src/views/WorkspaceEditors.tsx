import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button, Field, Input, useToast } from '../components/ui'
import { getState, put, setConfig, useStore } from '../lib/store'
import type { Level } from '../lib/types'
import { uid } from '../lib/util'

export function LevelsEditor() {
  const levels = useStore((s) => s.config.levels)
  const cmap = useStore((s) => s.candidates)
  const [list, setList] = useState<Level[]>(levels)
  const toast = useToast()
  const count = (id: string) => Object.values(cmap).filter((c) => c.stage === id).length
  const nextId = () => { for (let k = 1; k < 99; k++) if (!list.some((l) => l.id === `l${k}`)) return `l${k}`; return uid('lv') }
  const move = (i: number, d: number) => { const n = [...list]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x!); setList(n) }
  const dirty = JSON.stringify(list) !== JSON.stringify(levels)
  async function save() {
    const clean = list.map((l) => ({ ...l, label: l.label.trim() || l.id.toUpperCase() }))
    const gone = levels.filter((l) => !clean.some((c) => c.id === l.id))
    // anyone sitting at a removed level goes back to Contacted, with a remark, so no profile is lost
    for (const g of gone) for (const c of Object.values(getState().candidates).filter((c) => c.stage === g.id))
      await put('candidates', { ...c, stage: 'contacted', remarks: [...c.remarks, { id: uid('r'), at: Date.now(), kind: 'stage', text: `Level "${g.label}" was removed; moved to Contacted` }] })
    await setConfig({ levels: clean }); toast('Interview levels saved')
  }
  return <section className="section" aria-labelledby="h-lv">
    <div className="section-head"><h2 id="h-lv">Interview levels</h2><p>The rounds between Contacted and Selected. Used on the tracker, pipeline, dashboard and interviews.</p></div>
    <div className="levels-ed">
      {list.map((l, i) => <div className="lv" key={l.id}>
        <code>{l.id}</code>
        <Input aria-label={`Level ${i + 1} name`} value={l.label} onChange={(e) => setList(list.map((x) => (x.id === l.id ? { ...x, label: e.target.value } : x)))} />
        <Button variant="ghost" icon aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={14} /></Button>
        <Button variant="ghost" icon aria-label="Move down" disabled={i === list.length - 1} onClick={() => move(i, 1)}><ArrowDown size={14} /></Button>
        <Button variant="ghost" icon aria-label={`Remove ${l.label}`} disabled={list.length <= 1} title={count(l.id) ? `${count(l.id)} candidates here move to Contacted on save` : undefined} onClick={() => setList(list.filter((x) => x.id !== l.id))}><Trash2 size={14} /></Button>
      </div>)}
      <div className="row">
        <Button onClick={() => { const id = nextId(); setList([...list, { id, label: `${id.toUpperCase()} round` }]) }}><Plus size={14} />Add level</Button>
        <Button variant="ink" disabled={!dirty} onClick={save}>Save levels</Button>
        {dirty && <Button variant="ghost" onClick={() => setList(levels)}>Undo</Button>}
      </div>
    </div>
  </section>
}

export function BandsEditor() {
  const bands = useStore((s) => s.config.bands)
  const [b, setB] = useState(bands)
  const toast = useToast()
  const ok = b.near < b.potential && b.near >= 0 && b.potential <= 100
  return <section className="section" aria-labelledby="h-bd">
    <div className="section-head"><h2 id="h-bd">Match colours</h2><p>How a match percentage is labelled everywhere</p></div>
    <div className="form-grid">
      <Field label="Potential match from (green)"><Input type="number" min={1} max={100} value={b.potential} onChange={(e) => setB({ ...b, potential: +e.target.value })} /></Field>
      <Field label="Near match from (orange)" hint={ok ? `Below ${b.near}% is Not a match (red)` : 'Must be lower than the green threshold'} error={ok ? undefined : ' '}><Input type="number" min={0} max={99} value={b.near} onChange={(e) => setB({ ...b, near: +e.target.value })} /></Field>
      <div className="row span-2">
        <span className="small"><span className="band-swatch" style={{ background: 'var(--match-good)' }} />{b.potential}% and above</span>
        <span className="small"><span className="band-swatch" style={{ background: 'var(--match-near)' }} />{b.near}–{b.potential - 1}%</span>
        <span className="small"><span className="band-swatch" style={{ background: 'var(--match-low)' }} />below {b.near}%</span>
        <Button variant="ink" disabled={!ok || (b.near === bands.near && b.potential === bands.potential)} onClick={async () => { await setConfig({ bands: b }); toast('Match colours saved') }}>Save</Button>
      </div>
    </div>
  </section>
}
