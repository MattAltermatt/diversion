import { z } from 'zod'

export const starfieldSchema = z.object({
  starCount: z.number().int().min(100).max(5000).default(900)
    .meta({ section: 'Field', ui: 'slider', min: 100, max: 5000, step: 20, label: 'Star count',
            help: 'How many stars stream past. More = a denser sky.' }),
  spread: z.number().min(0.6).max(2.4).default(1.4)
    .meta({ section: 'Field', ui: 'slider', min: 0.6, max: 2.4, step: 0.05, label: 'Field width',
            help: 'How wide the star field spreads across the view. Wider fills the edges; '
                + 'narrower funnels stars toward the centre.' }),
  starSize: z.number().min(0.5).max(4).default(1.4)
    .meta({ section: 'Field', ui: 'slider', min: 0.5, max: 4, step: 0.1, label: 'Star size',
            help: 'Base thickness of each star. Near stars grow larger than far ones.' }),
  warpSpeed: z.number().min(0).max(1).default(0.18)
    .meta({ section: 'Warp', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Warp speed',
            help: 'How fast you fly forward. Low = a calm drifting starfield of dots; '
                + 'high = a full hyperspace jump where stars stretch into long streaks.' }),
  roll: z.number().min(-1).max(1).default(0.06)
    .meta({ section: 'Warp', ui: 'slider', min: -1, max: 1, step: 0.01, label: 'Roll',
            help: 'Slowly rotates the whole field as you fly. 0 = no roll; sign sets direction.' }),
  starColorMode: z.enum(['white', 'blue-white', 'spectrum']).default('blue-white')
    .meta({ section: 'Color', ui: 'segmented', options: ['white', 'blue-white', 'spectrum'],
            label: 'Star color',
            help: 'white: pure white stars. blue-white: a cool blue-to-white stellar spectrum. '
                + 'spectrum: subtle pastel tints across the whole spectrum.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#02030a')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'Deep-space color behind the stars. Streaks fade toward this.' }),
  trailFade: z.number().min(0).max(1).default(0.55)
    .meta({ section: 'Look', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Trail persistence',
            help: 'How long streaks linger. 0 = crisp moving dots wiped each frame; '
                + 'high = long smeared light-trails for a stronger hyperspace look.' }),
  glow: z.boolean().default(true)
    .meta({ section: 'Look', ui: 'toggle', label: 'Glow',
            help: 'Adds a soft halo around each star for a brighter, dreamier field.' }),
  seed: z.number().int().default(72301)
    .meta({ section: 'Advanced', collapsed: true, ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed reproduces the same star layout. A fresh visit '
                + 'rolls a new sky.' }),
})

export type StarfieldConfig = z.infer<typeof starfieldSchema>
