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
    // bounded → range input
    expect(screen.getByDisplayValue('4000')).toHaveAttribute('type', 'range')
    // open-ended → number input
    expect(screen.getByDisplayValue('1')).toHaveAttribute('type', 'number')
    // toggle present as a switch
    expect(screen.getByRole('switch')).toBeInTheDocument()
    // nested group rendered (expanded) with its label + child slider
    expect(screen.getByText('Palette')).toBeInTheDocument()
    expect(screen.getByDisplayValue('200')).toHaveAttribute('type', 'range')
  })
})
