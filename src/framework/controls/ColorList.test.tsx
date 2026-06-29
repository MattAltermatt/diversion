import { useState } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ColorList, splitColor, joinColor } from './ColorList'
import type { FieldMeta } from '../fieldMeta'

const meta: FieldMeta = { ui: 'colorList', label: 'Colors', min: 1, max: 8 }

describe('splitColor / joinColor', () => {
  it('splits #rrggbbaa into rgb + alpha percent (hasAlpha)', () => {
    expect(splitColor('#1e63ff1f')).toEqual({ rgb: '#1e63ff', alpha: 12, hasAlpha: true })
    expect(splitColor('#ffffffff')).toEqual({ rgb: '#ffffff', alpha: 100, hasAlpha: true })
    expect(splitColor('#00000000')).toEqual({ rgb: '#000000', alpha: 0, hasAlpha: true })
  })
  it('treats a 6-hex #rrggbb as alpha-less (opaque, hasAlpha false — no NaN)', () => {
    // Regression: a 6-hex stop used to read alpha from non-existent chars 7-8,
    // yielding NaN%. It is now reported opaque with no alpha dimension.
    expect(splitColor('#020814')).toEqual({ rgb: '#020814', alpha: 100, hasAlpha: false })
    expect(splitColor('#1bd6ff')).toEqual({ rgb: '#1bd6ff', alpha: 100, hasAlpha: false })
  })
  it('joins rgb + alpha percent back into #rrggbbaa', () => {
    expect(joinColor('#1e63ff', 12)).toBe('#1e63ff1f')
    expect(joinColor('#ffffff', 100)).toBe('#ffffffff')
    expect(joinColor('#000000', 0)).toBe('#00000000')
  })
})

describe('ColorList', () => {
  it('renders one row per color', () => {
    render(<ColorList value={['#1e63ff1f', '#16d6ff1a']} onChange={vi.fn()} meta={meta} />)
    expect(screen.getAllByRole('slider')).toHaveLength(2) // one alpha slider per color
    expect(screen.getByText('2 colors')).toBeInTheDocument()
  })

  it('appends a new color when "Add color" is clicked', () => {
    const onChange = vi.fn()
    render(<ColorList value={['#1e63ff1f']} onChange={onChange} meta={meta} />)
    fireEvent.click(screen.getByRole('button', { name: /add color/i }))
    expect(onChange).toHaveBeenCalledWith(['#1e63ff1f', '#7df5cf1a'])
  })

  it('removes a color, and disables remove at the minimum', () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <ColorList value={['#1e63ff1f', '#16d6ff1a']} onChange={onChange} meta={meta} />,
    )
    fireEvent.click(screen.getAllByRole('button', { name: /remove color/i })[0])
    expect(onChange).toHaveBeenCalledWith(['#16d6ff1a'])
    rerender(<ColorList value={['#16d6ff1a']} onChange={onChange} meta={meta} />)
    expect(screen.getByRole('button', { name: /remove color/i })).toBeDisabled()
  })

  it('rewrites only the alpha byte when the alpha slider moves', () => {
    const onChange = vi.fn()
    render(<ColorList value={['#1e63ff1f']} onChange={onChange} meta={meta} />)
    fireEvent.change(screen.getByRole('slider'), { target: { value: '50' } })
    expect(onChange).toHaveBeenCalledWith(['#1e63ff80']) // 50% -> 0x80, color preserved
  })

  it('preserves a row\'s in-progress (uncommitted) hex edit when a lower row is removed', () => {
    // Controlled-parent harness: holds the committed value, re-renders on change.
    function Harness() {
      const [v, setV] = useState(['#1e63ff1f', '#16d6ff1a'])
      return <ColorList value={v} onChange={setV} meta={meta} />
    }
    render(<Harness />)
    const hexFields = screen.getAllByRole('textbox')
    // Type a partial, invalid hex into the SECOND row — too short to commit,
    // so onChange never fires and the value prop stays unchanged.
    fireEvent.change(hexFields[1], { target: { value: '#abcd' } })
    // Remove the FIRST row.
    fireEvent.click(screen.getAllByRole('button', { name: /remove color/i })[0])
    // The surviving row must still show the in-progress edit, not snap back.
    const remaining = screen.getByRole('textbox')
    expect((remaining as HTMLInputElement).value).toBe('#abcd')
  })

  it('rewrites only the color bytes when a valid hex is typed', () => {
    const onChange = vi.fn()
    render(<ColorList value={['#1e63ff1f']} onChange={onChange} meta={meta} />)
    const hex = screen.getByRole('textbox') // the editable hex field (single row)
    fireEvent.change(hex, { target: { value: '#ff0000' } })
    expect(onChange).toHaveBeenCalledWith(['#ff00001f']) // alpha 0x1f preserved
  })

  // ── Alpha-less (6-hex) palettes — e.g. physarum's opaque density ramp ──
  it('renders no alpha slider for a 6-hex (alpha-less) palette', () => {
    render(<ColorList value={['#020814', '#1bd6ff']} onChange={vi.fn()} meta={meta} />)
    expect(screen.queryAllByRole('slider')).toHaveLength(0) // no NaN% alpha row
  })

  it('appends a 6-hex color when adding to a 6-hex field', () => {
    const onChange = vi.fn()
    render(<ColorList value={['#020814']} onChange={onChange} meta={meta} />)
    fireEvent.click(screen.getByRole('button', { name: /add color/i }))
    expect(onChange).toHaveBeenCalledWith(['#020814', '#7df5cf']) // 6-hex, not #7df5cf1a
  })

  it('emits a bare 6-hex when a valid hex is typed into a 6-hex field', () => {
    const onChange = vi.fn()
    render(<ColorList value={['#020814']} onChange={onChange} meta={meta} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '#ff0000' } })
    expect(onChange).toHaveBeenCalledWith(['#ff0000']) // no alpha byte appended
  })
})
