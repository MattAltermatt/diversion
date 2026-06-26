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
