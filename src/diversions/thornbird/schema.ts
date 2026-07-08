import { z } from 'zod'

export const thornbirdSchema = z.object({
  paramA: z.number().min(1.0).max(3.0).default(1.99)
    .meta({ section: 'Attractor', ui: 'slider', min: 1.0, max: 3.0, step: 0.01, label: 'Branch density (A)',
            help: 'The cosine’s angular coefficient. Values near 2 give the classic dense bird shape; '
                + 'push away from 2 for looser or finer thorn-thickets.' }),
  paramC: z.number().min(0.1).max(0.95).default(0.80)
    .meta({ section: 'Attractor', ui: 'slider', min: 0.1, max: 0.95, step: 0.01, label: 'Feedback (C)',
            help: 'How much of the point two steps back is echoed into each new point. Higher = long '
                + 'looping filaments; lower = tight thorny scribbles.' }),
  pointsPerFrame: z.number().int().min(1000).max(50000).default(20000)
    .meta({ section: 'Attractor', ui: 'slider', min: 1000, max: 50000, step: 1000,
            label: 'Points per frame',
            help: 'How many points are plotted each frame. Higher = the thread cloud fills in '
                + 'faster and denser.' }),
  drift: z.number().min(0).max(1).default(0.15)
    .meta({ section: 'Attractor', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Drift',
            help: 'Slowly wobbles Branch density and Feedback over time so the bird shape breathes. '
                + '0 = frozen at the exact values above.' }),
  fadeTrails: z.boolean().default(true)
    .meta({ section: 'Trails', ui: 'toggle', label: 'Fade trails',
            help: 'On: old density slowly fades, so the morphing threads leave a soft wake. '
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
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#05070f')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'Density fades toward this color.' }),
  color: z.object({
    mode: z.enum(['palette', 'gradient']).default('gradient')
      .meta({ ui: 'segmented', options: ['palette', 'gradient'], label: 'Mode',
              help: 'Palette: color is banded by position. Gradient: smooth ramp sampled '
                  + 'along the source.' }),
    colors: z.array(z.string().regex(/^#[0-9a-fA-F]{8}$/)).min(1).max(8)
      .default(['#5ce1ff66', '#8f6cff66', '#ff9ecb66', '#ffe08a66'])
      .meta({ ui: 'colorList', label: 'Colors', min: 1, max: 8,
              showWhen: { field: 'mode', equals: 'palette' },
              help: 'Color bands by position (low alpha lets density build up additively).' }),
    source: z.enum(['radius', 'x', 'y']).default('radius')
      .meta({ ui: 'segmented', options: ['radius', 'x', 'y'], label: 'Color source',
              help: 'What position drives the color: radius (distance from center — reads '
                  + 'beautifully on a centered cloud), or x / y screen position.' }),
    stops: z.array(z.string().regex(/^#[0-9a-fA-F]{8}$/)).min(2).max(8)
      .default(['#2a1a5566', '#5c3bd966', '#5ce1ff66', '#9effc766', '#ffe08a66'])
      .meta({ ui: 'colorList', label: 'Gradient stops', min: 2, max: 8,
              showWhen: { field: 'mode', equals: 'gradient' },
              help: 'Colors are evenly spaced and sampled along the source; per-stop alpha '
                  + 'controls additive build-up.' }),
  }).default({
    mode: 'gradient',
    colors: ['#5ce1ff66', '#8f6cff66', '#ff9ecb66', '#ffe08a66'],
    source: 'radius',
    stops: ['#2a1a5566', '#5c3bd966', '#5ce1ff66', '#9effc766', '#ffe08a66'],
  }).meta({ section: 'Color', ui: 'group', label: 'Color' }),
  seed: z.number().int().default(7)
    .meta({ section: 'Advanced', collapsed: true, ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. Sets the two incommensurate wobble periods that pace the drift. '
                + 'A fresh visit rolls a new one to discover a different breathing rhythm.' }),
})

export type ThornbirdConfig = z.infer<typeof thornbirdSchema>
