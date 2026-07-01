import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { z } from 'zod'
import { SchemaForm } from './SchemaForm'

const schema = z.object({
  particles: z
    .number()
    .min(100)
    .max(20000)
    .default(4000)
    .meta({ ui: 'slider', min: 100, max: 20000, step: 100, label: 'Particles' }),
  seed: z.number().default(1).meta({ ui: 'number', label: 'Seed' }),
  fadeTrails: z.boolean().default(true).meta({ ui: 'toggle', label: 'Fade trails' }),
  palette: z
    .object({
      hueStart: z
        .number()
        .min(0)
        .max(360)
        .default(200)
        .meta({ ui: 'slider', min: 0, max: 360, step: 1, label: 'Hue start' }),
    })
    .default({ hueStart: 200 })
    .meta({ ui: 'group', label: 'Palette' }),
})

describe('SchemaForm', () => {
  it('renders a slider for bounded, a number input for open-ended, and an expanded group', () => {
    const value = schema.parse({})
    render(<SchemaForm schema={schema} value={value} onChange={() => {}} />)
    // bounded → range slider (both particles + nested hue start) plus editable readouts
    expect(screen.getAllByRole('slider')).toHaveLength(2)
    expect(screen.getByLabelText('Particles value')).toHaveValue(4000)
    // open-ended → number input
    expect(screen.getByDisplayValue('1')).toHaveAttribute('type', 'number')
    // toggle present as a switch
    expect(screen.getByRole('switch')).toBeInTheDocument()
    // nested group rendered (expanded) with its label + child slider readout
    expect(screen.getByText('Palette')).toBeInTheDocument()
    expect(screen.getByLabelText('Hue start value')).toHaveValue(200)
  })

  it('honors showWhen: renders a field only when its sibling holds the named value', () => {
    const swSchema = z.object({
      mode: z.enum(['a', 'b']).default('a').meta({ ui: 'segmented', options: ['a', 'b'], label: 'Mode' }),
      onlyA: z.number().default(5).meta({ ui: 'number', label: 'Only A', showWhen: { field: 'mode', equals: 'a' } }),
      onlyB: z.number().default(9).meta({ ui: 'number', label: 'Only B', showWhen: { field: 'mode', equals: 'b' } }),
    })
    // mode 'a' → onlyA shows, onlyB hidden
    const { rerender } = render(<SchemaForm schema={swSchema} value={{ mode: 'a', onlyA: 5, onlyB: 9 }} onChange={() => {}} />)
    expect(screen.getByText('Only A')).toBeInTheDocument()
    expect(screen.queryByText('Only B')).not.toBeInTheDocument()
    // flip to 'b' → swap
    rerender(<SchemaForm schema={swSchema} value={{ mode: 'b', onlyA: 5, onlyB: 9 }} onChange={() => {}} />)
    expect(screen.queryByText('Only A')).not.toBeInTheDocument()
    expect(screen.getByText('Only B')).toBeInTheDocument()
  })

  it("renders a ui:'select' enum as a dropdown carrying every option", () => {
    const selSchema = z.object({
      palette: z.enum(['Mariners', 'Spectrum', 'Neon']).default('Spectrum')
        .meta({ ui: 'select', options: ['Mariners', 'Spectrum', 'Neon'], label: 'Palette' }),
    })
    const onChange = vi.fn()
    render(<SchemaForm schema={selSchema} value={selSchema.parse({})} onChange={onChange} />)
    const box = screen.getByRole('combobox')
    expect(box).toHaveValue('Spectrum')
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Mariners', 'Spectrum', 'Neon'])
    fireEvent.change(box, { target: { value: 'Neon' } })
    expect(onChange).toHaveBeenCalledWith({ palette: 'Neon' })
  })

  it("renders nothing for a ui:'hidden' field (URL-encoded but not a control)", () => {
    const hidSchema = z.object({
      visible: z.number().default(3).meta({ ui: 'number', label: 'Visible' }),
      rule: z.enum(['RL', 'LLRR']).default('RL').meta({ ui: 'hidden', label: 'Rule' }),
    })
    render(<SchemaForm schema={hidSchema} value={hidSchema.parse({})} onChange={() => {}} />)
    expect(screen.getByText('Visible')).toBeInTheDocument()
    // the hidden field contributes no control and no label, and does not throw
    expect(screen.queryByText('Rule')).not.toBeInTheDocument()
  })

  it('groups fields into collapsible subpanels by section', () => {
    const secSchema = z.object({
      a: z.number().default(1).meta({ ui: 'number', label: 'Field A', section: 'Alpha' }),
      b: z.number().default(2).meta({ ui: 'number', label: 'Field B', section: 'Beta' }),
    })
    render(<SchemaForm schema={secSchema} value={secSchema.parse({})} onChange={() => {}} />)
    // each section is a header button, expanded by default, with its control visible
    const alpha = screen.getByRole('button', { name: /Alpha/ })
    expect(alpha).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Field A')).toBeInTheDocument()
    expect(screen.getByText('Field B')).toBeInTheDocument()
    // collapsing Alpha hides ITS control but leaves Beta untouched (discoverable, not gone)
    fireEvent.click(alpha)
    expect(alpha).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Field A')).not.toBeInTheDocument()
    expect(screen.getByText('Field B')).toBeInTheDocument()
  })

  it('renders no subpanel chrome when the schema declares no sections', () => {
    const flat = z.object({
      x: z.number().default(1).meta({ ui: 'number', label: 'Ex' }),
    })
    const { container } = render(<SchemaForm schema={flat} value={flat.parse({})} onChange={() => {}} />)
    expect(container.querySelector('.subpanel')).toBeNull()
    expect(screen.getByText('Ex')).toBeInTheDocument()
  })
})
