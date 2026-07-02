import { z } from 'zod'

export const strangeAttractorsSchema = z.object({
  attractor: z.enum(['clifford', 'deJong']).default('clifford')
    .meta({ section: 'Attractor', ui: 'segmented', options: ['clifford', 'deJong'],
            label: 'Attractor',
            help: 'Which chaotic map is plotted. Each has its own family of shapes; '
                + 'changing it draws a fresh seed of that map.' }),
  pointsPerFrame: z.number().int().min(1000).max(50000).default(20000)
    .meta({ section: 'Attractor', ui: 'slider', min: 1000, max: 50000, step: 1000,
            label: 'Points per frame',
            help: 'How many points are plotted each frame. Higher = the cloud fills in '
                + 'faster and denser.' }),
  drift: z.number().min(0).max(1).default(0.15)
    .meta({ section: 'Attractor', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Drift',
            help: 'Slowly morphs the attractor over time so it never sits still. 0 = frozen.' }),
  fadeTrails: z.boolean().default(true)
    .meta({ section: 'Trails', ui: 'toggle', label: 'Fade trails',
            help: 'On: old density slowly fades, so the morphing cloud leaves a soft wake. '
                + 'Off: each frame is wiped clean.' }),
  trailLength: z.number().min(0).max(100).default(72)
    .meta({ section: 'Trails', ui: 'slider', min: 0, max: 100, step: 1, label: 'Trail length',
            help: 'How long density lingers before fading. Higher = fuller, slower-fading '
                + 'cloud. Only matters when Fade trails is on.' }),
  blend: z.enum(['lighter', 'screen', 'normal']).default('lighter')
    .meta({ section: 'Trails', ui: 'segmented', options: ['lighter', 'screen', 'normal'],
            label: 'Blend',
            help: 'How overlapping points combine:\n'
                + '- lighter (default): additive — dense filaments glow brighter\n'
                + '- screen: glows and mixes; dense areas wash toward white\n'
                + '- normal: each point’s flat color' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#050810')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'Density fades toward this colour.' }),
  color: z.object({
    mode: z.enum(['palette', 'gradient']).default('gradient')
      .meta({ ui: 'segmented', options: ['palette', 'gradient'], label: 'Mode',
              help: 'Palette: color is banded by position. Gradient: smooth ramp sampled '
                  + 'along the source.' }),
    colors: z.array(z.string().regex(/^#[0-9a-fA-F]{8}$/)).min(1).max(8)
      .default(['#2a5cf066', '#4d9bff66', '#ffc22e66', '#ffe08a66'])
      .meta({ ui: 'colorList', label: 'Colors', min: 1, max: 8,
              showWhen: { field: 'mode', equals: 'palette' },
              help: 'Color bands by position (low alpha lets density build up additively).' }),
    source: z.enum(['radius', 'x', 'y']).default('radius')
      .meta({ ui: 'segmented', options: ['radius', 'x', 'y'], label: 'Color source',
              help: 'What position drives the color: radius (distance from center — reads '
                  + 'beautifully on a centered cloud), or x / y screen position.' }),
    stops: z.array(z.string().regex(/^#[0-9a-fA-F]{8}$/)).min(2).max(8)
      .default(['#3b1a6a66', '#7a3bff66', '#3bd2ff66', '#3bff7a66', '#ffe08a66'])
      .meta({ ui: 'colorList', label: 'Gradient stops', min: 2, max: 8,
              showWhen: { field: 'mode', equals: 'gradient' },
              help: 'Colors are evenly spaced and sampled along the source; per-stop alpha '
                  + 'controls additive build-up.' }),
  }).default({
    mode: 'gradient',
    colors: ['#2a5cf066', '#4d9bff66', '#ffc22e66', '#ffe08a66'],
    source: 'radius',
    stops: ['#3b1a6a66', '#7a3bff66', '#3bd2ff66', '#3bff7a66', '#ffe08a66'],
  }).meta({ section: 'Color', ui: 'group', label: 'Color' }),
  seed: z.number().int().default(7)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed always regenerates the same attractor. '
                + 'A fresh visit rolls a new one to discover a different map.' }),
})

export type StrangeAttractorsConfig = z.infer<typeof strangeAttractorsSchema>
