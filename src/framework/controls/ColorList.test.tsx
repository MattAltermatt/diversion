import { useState } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ColorList, splitColor, joinColor } from './ColorList'
import type { FieldMeta } from '../fieldMeta'

const meta: FieldMeta = { ui: 'colorList', label: 'Colors', min: 1, max: 8 }

describe('splitColor / joinColor', () => {
  it('splits #rrggbbaa into rgb + alpha percent', () => {
    expect(splitColor('#1e63ff1f')).toEqual({ rgb: '#1e63ff', alpha: 12 })
    expect(splitColor('#ffffffff')).toEqual({ rgb: '#ffffff', alpha: 100 })
    expect(splitColor('#00000000')).toEqual({ rgb: '#000000', alpha: 0 })
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
})
