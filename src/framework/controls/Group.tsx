import type { ReactNode } from 'react'

export function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <fieldset className="group">
      <legend className="glabel">{label}</legend>
      {children}
    </fieldset>
  )
}
