import { z } from 'zod'

const hex6 = z.string().regex(/^#[0-9a-fA-F]{6}$/)

export const fuzzyflakesSchema = z.object({
  flakeCount: z.number().int().min(4).max(200).default(42)
    .meta({ section: 'Flakes', ui: 'slider', min: 4, max: 200, step: 1, label: 'Flake count',
            help: 'How many snowflakes drift in the field. Fewer = calmer, more open.' }),
  arms: z.number().int().min(3).max(8).default(6)
    .meta({ section: 'Flakes', ui: 'slider', min: 3, max: 8, step: 1, label: 'Arms (K)',
            help: 'Fold symmetry: one arm is drawn and repeated K times around the centre. 6 = classic snowflake.' }),
  sizeMin: z.number().min(6).max(90).default(16)
    .meta({ section: 'Flakes', ui: 'slider', min: 6, max: 90, step: 1, label: 'Smallest',
            help: 'Radius of the smallest (far, background) flakes.' }),
  sizeMax: z.number().min(10).max(160).default(58)
    .meta({ section: 'Flakes', ui: 'slider', min: 10, max: 160, step: 1, label: 'Largest',
            help: 'Radius of the largest (near, foreground) flakes. Near flakes drift faster for depth.' }),

  driftSpeed: z.number().min(0).max(1).default(0.24)
    .meta({ section: 'Motion', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Drift speed',
            help: 'Gentle downward breeze. 0 = frozen. Calm by default.' }),
  rotateSpeed: z.number().min(0).max(1).default(0.14)
    .meta({ section: 'Motion', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Rotate speed',
            help: 'How fast each flake slowly spins. 0 = still.' }),

  fuzziness: z.number().min(0).max(1).default(0.55)
    .meta({ section: 'Style', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Fuzziness',
            help: 'Softness of the plush halo glowing under each crisp flake. High = cozy and soft.' }),
  armStyle: z.enum(['stem', 'dotted', 'crystal']).default('stem')
    .meta({ section: 'Style', ui: 'segmented', options: ['stem', 'dotted', 'crystal'], label: 'Arm style',
            help: 'The motif drawn along each arm: branching stem, a row of beads, or a crystal plate.' }),

  palette: z.enum(['frost', 'pastel', 'jewel']).default('frost')
    .meta({ section: 'Color', ui: 'segmented', options: ['frost', 'pastel', 'jewel'], label: 'Palette',
            help: 'Frost = icy blues & white. Pastel = soft candy. Jewel = rich saturated gems.' }),
  background: hex6.default('#0a1630')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'The deep field the flakes drift across. Keep it dark for contrast.' }),

  seed: z.number().int().default(1)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. Same seed → same flakes. A fresh visit rolls a new field.' }),
})

export type FuzzyflakesConfig = z.infer<typeof fuzzyflakesSchema>
