import { useLayoutEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function TopBar({ title, crumb, actions }: { title: ReactNode; crumb?: ReactNode; actions?: ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => { setEl(document.getElementById('topbar-slot')) }, [])
  if (!el) return null
  return createPortal(<>
    {crumb}
    <h1>{title}</h1>
    <span className="spacer" />
    <div className="row">{actions}</div>
  </>, el)
}
