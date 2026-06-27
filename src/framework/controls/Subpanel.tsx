import { useState, type ReactNode } from 'react'

/**
 * A titled, collapsible section of the config form. Honors UX invariant #2:
 * controls stay discoverable (the header names what's inside and one click
 * reveals it) — collapsing hides the controls, not their existence. Default open
 * so nothing is hidden until the user chooses to tuck a section away.
 */
export function Subpanel({
  label,
  children,
  defaultOpen = true,
}: {
  label: string
  children: ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="subpanel">
      <button
        type="button"
        className="subpanel-head"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="subpanel-chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
        <span className="subpanel-title">{label}</span>
      </button>
      {open && <div className="subpanel-body">{children}</div>}
    </section>
  )
}
