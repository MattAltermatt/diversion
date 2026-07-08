import { z } from 'zod'

export const hopalongSchema = z.object({
  map: z.enum(['martin', 'sine', 'rr']).default('martin')
    .meta({ section: 'Attractor', ui: 'segmented', options: ['martin', 'sine', 'rr'], label: 'Map',
            help: 'Which Hopalong-family recurrence is iterated: martin — Barry Martin\'s '
                + 'original square-root hop · sine — Martin\'s simpler sine cousin · '
                + 'rr — Renaldo Recuerdo\'s generalized-exponent cousin. Each has its own '
                + 'family of shapes.' }),
  pointsPerFrame: z.number().int().min(1000).max(40000).default(30000)
    .meta({ section: 'Attractor', ui: 'slider', min: 1000, max: 40000, step: 1000,
            label: 'Points per frame',
            help: 'How many orbit points are plotted each frame. Higher = the density map '
                + 'fills in and brightens faster.' }),
  drift: z.number().min(0).max(1).default(0.12)
    .meta({ section: 'Attractor', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Drift',
            help: 'Slowly morphs the map\'s coefficients over time, so the shape keeps '
                + 'evolving instead of just filling in and sitting still. 0 = frozen.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#05070f')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'Canvas ground color — also the color a never-visited pixel stays.' }),
  palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(2).max(8)
    .default(['#0b1a3d', '#2b4fd6', '#22d0e8', '#ffe45e', '#ffffff'])
    .meta({ section: 'Color', ui: 'colorList', label: 'Palette', min: 2, max: 8,
            help: 'A brightness ramp, dark to hot. Rarely-visited pixels sit near the start '
                + 'of the ramp; the densest caustic edges reach its last color.' }),
  seed: z.number().int().default(7)
    .meta({ section: 'Advanced', collapsed: true, ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed always regenerates the same orbit. '
                + 'A fresh visit rolls a new one to discover a different shape.' }),
})

export type HopalongConfig = z.infer<typeof hopalongSchema>
