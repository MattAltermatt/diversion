import { z } from 'zod'

export const flowFieldSchema = z.object({
  particles: z.number().int().min(100).max(20000).default(4000)
    .meta({ ui: 'slider', min: 100, max: 20000, step: 100, label: 'Particles' }),
  noiseScale: z.number().min(0.0005).max(0.02).default(0.004)
    .meta({ ui: 'slider', min: 0.0005, max: 0.02, step: 0.0005, label: 'Noise scale',
            help: 'Lower = broad, sweeping currents. Higher = tight, turbulent detail.' }),
  speed: z.number().min(0).max(1).default(0.5)
    .meta({ ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Speed' }),
  lifespan: z.number().min(0.5).max(12).default(4)
    .meta({ ui: 'slider', min: 0.5, max: 12, step: 0.1, label: 'Particle lifespan',
            help: 'Seconds a particle lives before respawning elsewhere. Shorter = busier, '
                + 'fewer long streaks; longer = sparser, longer ribbons.' }),
  seed: z.number().int().default(10847)
    .meta({ ui: 'number', step: 1, label: 'Seed',
            help: 'Any integer. The same seed always regenerates the same pattern.' }),
  blend: z.enum(['lighter', 'screen', 'normal']).default('screen')
    .meta({ ui: 'segmented', options: ['lighter', 'screen', 'normal'], label: 'Blend' }),
  fadeTrails: z.boolean().default(true)
    .meta({ ui: 'toggle', label: 'Motion trails',
            help: 'On: particles leave trails that fade out. Off: each frame is wiped clean.' }),
  trailLength: z.number().min(0).max(100).default(88)
    .meta({ ui: 'slider', min: 0, max: 100, step: 1, label: 'Trail length',
            help: 'Length of the fading motion trails. 0 wipes each frame; higher leaves '
                + 'longer, slower-fading ribbons. Only affects the look when Motion Trails is on.' }),
  palette: z.object({
    background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0a0a12')
      .meta({ ui: 'color', label: 'Background' }),
    colors: z.array(z.string().regex(/^#[0-9a-fA-F]{8}$/)).min(1).max(8)
      .default(['#1e63ff1f', '#16d6ff1a', '#ff3ea51a', '#ffffff14'])
      .meta({ ui: 'colorList', label: 'Colors', min: 1, max: 8,
              help: 'Each particle picks one color at random when it spawns and keeps it for '
                  + 'life. Low alpha lets overlapping ribbons build up into richer color '
                  + 'instead of clipping to white.' }),
  }).default({ background: '#0a0a12', colors: ['#1e63ff1f', '#16d6ff1a', '#ff3ea51a', '#ffffff14'] })
    .meta({ ui: 'group', label: 'Palette' }),
})

export type FlowFieldConfig = z.infer<typeof flowFieldSchema>
