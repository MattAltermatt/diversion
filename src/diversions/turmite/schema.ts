import { z } from 'zod'

// Curated turmite rules (one letter per color-state; L/R turn 90°, U u-turns,
// N goes straight). Single source for both the enum and the Rule presets.
export const RULES = [
  'RL',           // Langton's ant — chaos then an emergent highway
  'RLR',          // cardioid-like symmetric growth
  'LLRR',         // filled square spiral
  'RRLL',         // symmetric bloom
  'LRRRRRLLR',    // chaotic fractal-ish growth (default)
  'LLRRRLRLRLLR', // dense woven texture
  'RRLLLRLLLRRR', // spiral arms
  'LRRL',         // tight symmetric knot
  'RLLR',         // mirrored knot
  'RRLR',         // asymmetric drift
  'LLRRR',        // pinwheel
  'RRLLR',        // staggered growth
] as const

export const turmiteSchema = z.object({
  rule: z.enum(RULES).default('LRRRRRLLR')
    .meta({ ui: 'hidden', label: 'Rule' }),
  ants: z.number().int().min(1).max(12).default(3)
    .meta({ section: 'Turmite', ui: 'slider', min: 1, max: 12, step: 1, label: 'Ants',
            help: 'How many ants walk the grid at once. They share one grid and interact.' }),
  cellSize: z.number().int().min(2).max(16).default(4)
    .meta({ section: 'Grid', ui: 'slider', min: 2, max: 16, step: 1, label: 'Cell size',
            help: 'Pixels per grid cell. Smaller = finer, denser patterns.' }),
  speed: z.number().int().min(10).max(4000).default(900)
    .meta({ section: 'Grid', ui: 'slider', min: 10, max: 4000, step: 10, label: 'Speed',
            help: 'Simulation steps per second. Frame-rate independent — the look is the same on any display.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#070910')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'The canvas fill. Cells at the lowest state read close to this.' }),
  palette: z.array(z.string().regex(/^#[0-9a-fA-F]{8}$/)).min(2).max(12)
    .default([
      '#0a1020ff', '#173a6bff', '#2f6fb0ff', '#5aa9e6ff', '#9bd1ffff', '#ffe7b0ff',
      '#ffd27aff', '#ff9e57ff', '#e8643cff', '#b83a3aff', '#7a2c4cff', '#3a2c5aff',
    ])
    .meta({ section: 'Color', ui: 'colorList', min: 2, max: 12, label: 'Palette',
            help: 'One color per state. A cell cycles through the list each time an ant visits; '
                + 'the first color reads as erased (set it close to the background).' }),
  seed: z.number().int().default(7)
    .meta({ section: 'Advanced', collapsed: true, ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed always regenerates the same pattern. A fresh visit rolls a new one.' }),
})

export type TurmiteConfig = z.infer<typeof turmiteSchema>
