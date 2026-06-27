import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
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
})
