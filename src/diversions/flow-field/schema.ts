import { z } from 'zod'

export const flowFieldSchema = z.object({
  particles: z.number().int().min(100).max(20000).default(4000)
    .meta({ ui: 'slider', min: 100, max: 20000, step: 100, label: 'Particles' }),
  noiseScale: z.number().min(0.0005).max(0.02).default(0.004)
    .meta({ ui: 'slider', min: 0.0005, max: 0.02, step: 0.0005, label: 'Noise scale',
            help: 'Lower = broad, sweeping currents. Higher = tight, turbulent detail.' }),
  speed: z.number().min(0).max(1).default(0.5)
    .meta({ ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Speed' }),
  seed: z.number().int().default(10847)
    .meta({ ui: 'number', step: 1, label: 'Seed',
            help: 'Any integer. The same seed always regenerates the same pattern.' }),
  blend: z.enum(['lighter', 'screen', 'normal']).default('lighter')
    .meta({ ui: 'segmented', options: ['lighter', 'screen', 'normal'], label: 'Blend' }),
  fadeTrails: z.boolean().default(true)
    .meta({ ui: 'toggle', label: 'Motion trails',
            help: 'On: particles leave trails that fade out. Off: each frame is wiped clean.' }),
  palette: z.object({
    background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0a0a12')
      .meta({ ui: 'color', label: 'Background' }),
    hueStart: z.number().min(0).max(360).default(200)
      .meta({ ui: 'slider', min: 0, max: 360, step: 1, label: 'Hue start' }),
    hueRange: z.number().min(0).max(360).default(80)
      .meta({ ui: 'slider', min: 0, max: 360, step: 1, label: 'Hue range' }),
  }).default({ background: '#0a0a12', hueStart: 200, hueRange: 80 })
    .meta({ ui: 'group', label: 'Palette' }),
})

export type FlowFieldConfig = z.infer<typeof flowFieldSchema>
