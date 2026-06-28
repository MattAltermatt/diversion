import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NumberInput, randomNumber } from './NumberInput'

describe('randomNumber', () => {
  it('picks a positive integer for open-ended fields (e.g. a seed)', () => {
    expect(randomNumber({ step: 1 }, () => 0.5)).toBe(500_000)
    expect(randomNumber({ step: 1 }, () => 0)).toBe(0)
    expect(randomNumber({ step: 1 }, () => 0.999999)).toBeLessThan(1_000_000)
    expect(Number.isInteger(randomNumber({ step: 1 }, () => 0.42))).toBe(true)
  })

  it('stays within [min, max] when the field is bounded', () => {
    expect(randomNumber({ min: 0, max: 360, step: 1 }, () => 0.5)).toBe(180)
    expect(randomNumber({ min: 100, max: 200, step: 1 }, () => 0)).toBe(100)
    expect(randomNumber({ min: 100, max: 200, step: 1 }, () => 0.999999)).toBe(200)
  })

  it('does not round when the step is fractional', () => {
    expect(randomNumber({ min: 0, max: 1, step: 0.01 }, () => 0.5)).toBeCloseTo(0.5)
  })
})

describe('NumberInput randomize button', () => {
  const meta = { ui: 'number' as const, label: 'Seed', step: 1 }

  it('renders a randomize control and emits a new number when clicked', () => {
    const onChange = vi.fn()
    render(<NumberInput value={10847} onChange={onChange} meta={meta} />)
    const btn = screen.getByRole('button', { name: /randomize/i })
    fireEvent.click(btn)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(typeof onChange.mock.calls[0][0]).toBe('number')
  })
})

describe('NumberInput bounds (clamp / draft / NaN-guard)', () => {
  // e.g. substrate's drawTime: ui:'number' but Zod .min(1). The form must honor
  // meta.min/max so −/＋ and typing can't drift past the codec's guard.
  const bounded = { ui: 'number' as const, label: 'Draw time', min: 1, max: 10, step: 1 }
  const open = { ui: 'number' as const, label: 'Seed', step: 1 }

  it('clamps a typed value below min up to min on commit', () => {
    const onChange = vi.fn()
    render(<NumberInput value={5} onChange={onChange} meta={bounded} />)
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '0' } })
    expect(onChange).toHaveBeenCalledWith(1)
  })

  it('clamps a typed value above max down to max on commit', () => {
    const onChange = vi.fn()
    render(<NumberInput value={5} onChange={onChange} meta={bounded} />)
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '99' } })
    expect(onChange).toHaveBeenCalledWith(10)
  })

  it('does not coerce an empty draft to 0 mid-edit', () => {
    const onChange = vi.fn()
    render(<NumberInput value={5} onChange={onChange} meta={bounded} />)
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '' } })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('clamps the − button at the lower bound', () => {
    const onChange = vi.fn()
    render(<NumberInput value={1} onChange={onChange} meta={bounded} />)
    fireEvent.click(screen.getByRole('button', { name: '–' }))
    expect(onChange).toHaveBeenCalledWith(1) // 1 - 1 = 0 → clamped to min
  })

  it('clamps the + button at the upper bound', () => {
    const onChange = vi.fn()
    render(<NumberInput value={10} onChange={onChange} meta={bounded} />)
    fireEvent.click(screen.getByRole('button', { name: '+' }))
    expect(onChange).toHaveBeenCalledWith(10) // 10 + 1 = 11 → clamped to max
  })

  it('leaves open-ended (unbounded) fields unclamped — a seed can go negative', () => {
    const onChange = vi.fn()
    render(<NumberInput value={5} onChange={onChange} meta={open} />)
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '-42' } })
    expect(onChange).toHaveBeenCalledWith(-42)
  })
})
