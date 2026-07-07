import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MatrixEditor, effectiveMatrix } from './MatrixEditor'
import { particleLifeGpuSchema } from '../../diversions/particle-life-gpu/schema'
import { fields } from '../fieldMeta'

const meta = fields(particleLifeGpuSchema).find(([k]) => k === 'matrix')![2]
const cfg = (over: Record<string, unknown> = {}) => ({ ...particleLifeGpuSchema.parse({ colors: 4 }), ...over })

describe('MatrixEditor (read-only view)', () => {
  it('renders an n×n grid of cells for the species count', () => {
    render(<MatrixEditor config={cfg()} onConfigChange={() => {}} meta={meta} />)
    expect(screen.getAllByTestId(/^mcell-/)).toHaveLength(4 * 4)
  })

  it('reflows when species changes', () => {
    const { rerender } = render(<MatrixEditor config={cfg()} onConfigChange={() => {}} meta={meta} />)
    rerender(<MatrixEditor config={cfg({ colors: 6 })} onConfigChange={() => {}} meta={meta} />)
    expect(screen.getAllByTestId(/^mcell-/)).toHaveLength(6 * 6)
  })

  it('shows a plain-language relationship on hover, with the sign verb', () => {
    render(<MatrixEditor config={cfg()} onConfigChange={() => {}} meta={meta} />)
    fireEvent.pointerEnter(screen.getByTestId('mcell-1-2'))
    const ro = screen.getByTestId('matrix-readout').textContent || ''
    expect(ro).toMatch(/(attracts|repels|ignores)/)
  })
})

describe('MatrixEditor (editing)', () => {
  it('drag writes a full-length matrix and marks Custom', () => {
    let latest: any = null
    const config = { ...particleLifeGpuSchema.parse({ colors: 3 }) }
    render(<MatrixEditor config={config} onConfigChange={(n) => (latest = n)} meta={meta} />)
    const cell = screen.getByTestId('mcell-1-2')
    fireEvent.pointerDown(cell, { clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(cell, { clientY: 40, pointerId: 1 })
    fireEvent.pointerUp(cell, { pointerId: 1 })
    expect(latest.matrix).toHaveLength(9)
    expect(latest.matrix[1 * 3 + 2]).toBeGreaterThan(effectiveMatrix(config, meta)[1 * 3 + 2])
  })

  it('a cancelled drag stops mutating — no leaked pointermove after pointercancel (#267)', () => {
    let latest: any = null
    const config = { ...particleLifeGpuSchema.parse({ colors: 3 }) }
    render(<MatrixEditor config={config} onConfigChange={(n) => (latest = n)} meta={meta} />)
    const cell = screen.getByTestId('mcell-1-2')
    fireEvent.pointerDown(cell, { clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(cell, { clientY: 40, pointerId: 1 })
    expect(latest).not.toBeNull() // drag is live and writing
    fireEvent.pointerCancel(cell, { pointerId: 1 }) // an interrupting gesture cancels the drag
    latest = null
    fireEvent.pointerMove(cell, { clientY: 10, pointerId: 1 }) // hovering the cell afterwards
    expect(latest).toBeNull() // the move listener was removed → matrix is NOT silently mutated
  })

  it('Zero all writes an all-zero full-length matrix (Custom)', () => {
    let latest: any = null
    const config = { ...particleLifeGpuSchema.parse({ colors: 3 }) }
    render(<MatrixEditor config={config} onConfigChange={(n) => (latest = n)} meta={meta} />)
    fireEvent.click(screen.getByTestId('matrix-zero'))
    expect(latest.matrix).toEqual(new Array(9).fill(0))
  })

  it('Reset omits the matrix key entirely', () => {
    let latest: any = null
    const config = { ...particleLifeGpuSchema.parse({ colors: 3 }), matrix: new Array(9).fill(0.5) }
    render(<MatrixEditor config={config} onConfigChange={(n) => (latest = n)} meta={meta} />)
    fireEvent.click(screen.getByTestId('matrix-reset'))
    expect('matrix' in latest).toBe(false)
  })

  it('preset buttons write a full-length Custom matrix (#220)', () => {
    let latest: any = null
    const config = { ...particleLifeGpuSchema.parse({ colors: 3 }) }
    render(<MatrixEditor config={config} onConfigChange={(n) => (latest = n)} meta={meta} />)
    fireEvent.click(screen.getByTestId('matrix-preset-allplus'))
    expect(latest.matrix).toEqual(new Array(9).fill(1)) // All + → every pair attracts
    fireEvent.click(screen.getByTestId('matrix-preset-identity'))
    expect(latest.matrix[0]).toBe(1) // self
    expect(latest.matrix[1]).toBe(-1) // cross
  })

  it('Invert negates the effective matrix (#220)', () => {
    let latest: any = null
    const config = { ...particleLifeGpuSchema.parse({ colors: 3 }), matrix: new Array(9).fill(0.4) }
    render(<MatrixEditor config={config} onConfigChange={(n) => (latest = n)} meta={meta} />)
    fireEvent.click(screen.getByTestId('matrix-preset-invert'))
    expect(latest.matrix).toEqual(new Array(9).fill(-0.4))
  })

  it('Symmetric mode mirrors the partner cell on drag', () => {
    let latest: any = null
    const config = { ...particleLifeGpuSchema.parse({ colors: 3 }), symmetry: 'Symmetric' as const }
    render(<MatrixEditor config={config} onConfigChange={(n) => (latest = n)} meta={meta} />)
    const cell = screen.getByTestId('mcell-0-2')
    fireEvent.pointerDown(cell, { clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(cell, { clientY: 60, pointerId: 1 })
    fireEvent.pointerUp(cell, { pointerId: 1 })
    expect(latest.matrix[0 * 3 + 2]).toBeCloseTo(latest.matrix[2 * 3 + 0], 5)
  })
})
