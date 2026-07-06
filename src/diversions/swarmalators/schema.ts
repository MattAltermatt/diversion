// schema.ts — single source of truth (form + URL codec + Config type) for Swarmalators.
// Two live knobs J,K sweep the five collective states; colour is per-particle from phase.
import { z } from 'zod'
import { COLOR_MAPS } from './pack'

export const swarmalatorsSchema = z.object({
  count: z.number().int().min(500).max(16000).default(3000)
    .meta({ section: 'Swarm', ui: 'slider', min: 500, max: 16000, step: 500, label: 'Particles',
            help: 'How many swarmalators fill the field. The coupling is all-pairs, so the GPU works hardest here — 3000 stays smooth; push higher for a denser, glossier ring.' }),

  J: z.number().min(-1).max(1).default(1)
    .meta({ section: 'Coupling', ui: 'slider', min: -1, max: 1, step: 0.05, label: 'Phase → space (J)',
            help: 'How strongly a particle prefers to sit near others of a SIMILAR phase (color). High J sorts colors into a smooth wheel; the rainbow-ring states all live at J≈1.' }),
  K: z.number().min(-1).max(1).default(-0.75)
    .meta({ section: 'Coupling', ui: 'slider', min: -1, max: 1, step: 0.05, label: 'Phase sync (K)',
            help: 'How strongly neighbours pull each other into the SAME phase. K>0 syncs everything to one color; the interesting swarming states are at K≤0, where space and phase fight and the ring comes alive.' }),
  omegaSpread: z.number().min(0).max(1).default(0)
    .meta({ section: 'Coupling', ui: 'slider', min: 0, max: 1, step: 0.02, label: 'Shimmer',
            help: 'Gives each particle its own natural rhythm. 0 = the pure model. Turn it up to keep even the frozen states shimmering in color — a gentle life for the static presets.' }),

  colorMap: z.enum(COLOR_MAPS).default('Spectrum')
    .meta({ section: 'Look', ui: 'segmented', options: [...COLOR_MAPS], label: 'Color wheel',
            help: 'Maps phase → color on a seamless cyclic wheel. Spectrum is a perceptually-even rainbow; Sinebow is punchier; Pastel is soft and dreamy.' }),
  dotSize: z.number().min(1).max(5).default(2.5)
    .meta({ section: 'Look', ui: 'slider', min: 1, max: 5, step: 0.5, label: 'Particle size',
            help: 'Radius of each particle in pixels.' }),
  glow: z.boolean().default(true)
    .meta({ section: 'Look', ui: 'toggle', label: 'Glow',
            help: 'Render soft luminous blobs that bloom where they overlap. Off = crisp flat dots.' }),
  trailFade: z.number().min(0).max(0.6).default(0.12)
    .meta({ section: 'Look', ui: 'slider', min: 0, max: 0.6, step: 0.01, label: 'Trail length',
            help: 'How slowly the previous frame fades. Higher = longer, dreamier trails as the ring rotates. 0 = crisp, no trails.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#05070d')
    .meta({ section: 'Look', ui: 'color', label: 'Background', help: 'Trails fade toward this color. Dark reads best.' }),

  speed: z.number().min(0.02).max(4).default(1)
    .meta({ section: 'Motion', ui: 'slider', min: 0.02, max: 4, step: 0.02, label: 'Speed',
            help: 'Visual playback speed. Far below 1× slows the swarm to a meditative creep; above 1× fast-forwards the dance. The GPU has headroom to spare.' }),

  seed: z.number().int().default(1337)
    .meta({ section: 'Advanced', collapsed: true, ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The seed rolls the starting positions, phases and natural rhythms, so the same seed always STARTS the same world. A fresh visit rolls a new one.' }),
})

export type SwarmalatorsConfig = z.infer<typeof swarmalatorsSchema>
