import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Slider, clampToBounds } from './Slider'

const meta = { ui: 'slider' as const, label: 'Speed', min: 0, max: 10, step: 0.5 }

describe('clampToBounds', () => {
  it('clamps within [min, max]', () => {
    expect(clampToBounds(20, meta)).toBe(10)
    expect(clampToBounds(-5, meta)).toBe(0)
    expect(clampToBounds(3.5, meta)).toBe(3.5)
  })

  it('passes through when a bound is absent', () => {
    expect(clampToBounds(99, { min: 0 })).toBe(99)
    expect(clampToBounds(-99, { max: 0 })).toBe(-99)
    expect(clampToBounds(99, {})).toBe(99)
  })
})

describe('Slider editable readout', () => {
  it('renders an editable numeric readout showing the formatted value', () => {
    render(<Slider value={2.5} onChange={() => {}} meta={meta} />)
    expect(screen.getByRole('spinbutton')).toHaveValue(2.5)
  })

  it('emits the typed value, clamped to bounds', () => {
    const onChange = vi.fn()
    render(<Slider value={2.5} onChange={onChange} meta={meta} />)
    const readout = screen.getByRole('spinbutton')
    fireEvent.change(readout, { target: { value: '7' } })
    expect(onChange).toHaveBeenLastCalledWith(7)
    fireEvent.change(readout, { target: { value: '999' } })
    expect(onChange).toHaveBeenLastCalledWith(10) // clamped to max
    fireEvent.change(readout, { target: { value: '-3' } })
    expect(onChange).toHaveBeenLastCalledWith(0) // clamped to min
  })

  it('does not emit on empty or non-numeric input', () => {
    const onChange = vi.fn()
    render(<Slider value={2.5} onChange={onChange} meta={meta} />)
    const readout = screen.getByRole('spinbutton')
    fireEvent.change(readout, { target: { value: '' } })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('still emits from the range slider', () => {
    const onChange = vi.fn()
    render(<Slider value={2.5} onChange={onChange} meta={meta} />)
    fireEvent.change(screen.getByRole('slider'), { target: { value: '5' } })
    expect(onChange).toHaveBeenLastCalledWith(5)
  })
})

describe('Slider maxLabel', () => {
  const infMeta = { ui: 'slider' as const, label: 'Track lifespan', min: 1, max: 50, step: 1, maxLabel: '∞' }
  it('shows the maxLabel at max instead of the number', () => {
    render(<Slider value={50} onChange={() => {}} meta={infMeta} />)
    expect(screen.getByText('∞')).toBeInTheDocument()
  })
  it('shows the number below max', () => {
    render(<Slider value={20} onChange={() => {}} meta={infMeta} />)
    expect(screen.queryByText('∞')).not.toBeInTheDocument()
    expect(screen.getByRole('spinbutton')).toHaveValue(20)
  })
})
