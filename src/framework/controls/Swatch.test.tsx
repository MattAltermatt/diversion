import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Swatch } from './Swatch'
import type { FieldMeta } from '../fieldMeta'

const meta: FieldMeta = { ui: 'color', label: 'Ink A' }

describe('Swatch — plain 6-hex fields (the ~238 that were already fine)', () => {
  it('shows the value in the picker and emits a bare #rrggbb', () => {
    const onChange = vi.fn()
    render(<Swatch value="#05070d" onChange={onChange} meta={meta} />)
    const picker = screen.getByLabelText('Ink A color') as HTMLInputElement
    expect(picker.value).toBe('#05070d')
    fireEvent.change(picker, { target: { value: '#ff0000' } })
    expect(onChange).toHaveBeenCalledWith('#ff0000') // no alpha byte appended
  })

  it('grows no alpha row', () => {
    render(<Swatch value="#05070d" onChange={vi.fn()} meta={meta} />)
    expect(screen.queryByRole('slider')).toBeNull()
  })
})

describe("Swatch — 8-hex fields (#304: intermomentary's inks rendered black)", () => {
  // `<input type="color">` sanitizes anything that is not #+6 hex to #000000 and only
  // ever emits 6-hex, so handing it "#59e0ffcc" raw painted black AND made every pick
  // write a value the field's own /^#[0-9a-fA-F]{8}$/ rejects — silently reverted by
  // the codec on the next load. Swatch now reads the alpha byte off the value.
  it('feeds the picker only the rgb half, so it is not sanitized to black', () => {
    render(<Swatch value="#59e0ffcc" onChange={vi.fn()} meta={meta} />)
    expect((screen.getByLabelText('Ink A color') as HTMLInputElement).value).toBe('#59e0ff')
  })

  it('re-attaches the existing alpha byte when a color is picked', () => {
    const onChange = vi.fn()
    render(<Swatch value="#59e0ffcc" onChange={onChange} meta={meta} />)
    fireEvent.change(screen.getByLabelText('Ink A color'), { target: { value: '#ff0000' } })
    expect(onChange).toHaveBeenCalledWith('#ff0000cc') // 8-hex, alpha preserved
  })

  it('offers an alpha row that rewrites only the alpha byte', () => {
    const onChange = vi.fn()
    render(<Swatch value="#59e0ffcc" onChange={onChange} meta={meta} />)
    const alpha = screen.getByLabelText('Ink A opacity') as HTMLInputElement
    expect(alpha.value).toBe('80') // 0xcc / 255 -> 80%
    fireEvent.change(alpha, { target: { value: '50' } })
    expect(onChange).toHaveBeenCalledWith('#59e0ff80')
  })
})

describe('Swatch accessible names (WCAG 4.1.2, Level A)', () => {
  // .ctl-name is a sibling <span>, not a <label for>, so without an explicit name a
  // screen reader announces an unlabelled control — the same failure Toggle fixed in
  // #290. The two inputs must ALSO be distinguishable from each other.
  it('names the picker and the alpha slider distinctly', () => {
    render(<Swatch value="#59e0ffcc" onChange={vi.fn()} meta={meta} />)
    const names = screen.getAllByRole('slider').concat(screen.getByLabelText('Ink A color'))
    for (const el of names) expect(el.getAttribute('aria-label')).toBeTruthy()
    expect(screen.getByLabelText('Ink A color')).not.toBe(screen.getByLabelText('Ink A opacity'))
  })
})
