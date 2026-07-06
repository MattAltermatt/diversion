import { z } from 'zod'

const hex6 = z.string().regex(/^#[0-9a-fA-F]{6}$/)
const hex8 = z.string().regex(/^#[0-9a-fA-F]{8}$/)

// Hypnowheel (xscreensaver `hypnowheel`, GH #87). Several superimposed layers of
// the SAME M-arm spiral wheel — each arm a wedge that winds from center to rim over
// `spiralTightness` turns — rotate at slightly different rates. The near-identical
// layers beat into a hypnotic spiral moire that churns and breathes forever. The
// wheel is M-fold radially symmetric; the moire lives in the OVERLAP between layers,
// so the layers must be offset (layerOffset + differential churn) for it to appear.
export const hypnowheelSchema = z.object({
  arms: z.number().int().min(2).max(40).default(9)
    .meta({ section: 'Wheel', ui: 'slider', min: 2, max: 40, step: 1, label: 'Arms',
            help: 'How many spiral arms the wheel has (its M-fold symmetry). Few = bold pinwheel; many = a fine spiral grating that moires hard.' }),
  layers: z.number().int().min(2).max(6).default(3)
    .meta({ section: 'Wheel', ui: 'slider', min: 2, max: 6, step: 1, label: 'Layers',
            help: 'How many copies of the wheel are stacked. Two already interfere; more deepens the moire. Moire needs at least two, offset.' }),
  spiralTightness: z.number().min(0.25).max(6).default(2)
    .meta({ section: 'Wheel', ui: 'slider', min: 0.25, max: 6, step: 0.05, label: 'Tightness',
            help: 'Turns each arm winds from center to rim. Near 0 = straight spokes; high = a tightly coiled spiral. The moire beat sharpens with tightness.' }),
  dutyCycle: z.number().min(0.1).max(0.9).default(0.5)
    .meta({ section: 'Wheel', ui: 'slider', min: 0.1, max: 0.9, step: 0.05, label: 'Arm width',
            help: 'Fraction of each sector the solid arm fills (the rest is gap). 0.5 = equal arm/gap; the classic op-art balance.' }),

  layerOffset: z.number().min(0).max(30).default(8)
    .meta({ section: 'Motion', ui: 'slider', min: 0, max: 30, step: 1, label: 'Layer offset',
            help: 'Degrees each layer is rotated past the one below it. Sets the standing moire phase; 0 stacks them flush (no moire until churn spreads them).' }),
  rotationSpeed: z.number().min(-20).max(20).default(4)
    .meta({ section: 'Motion', ui: 'slider', min: -20, max: 20, step: 0.5, label: 'Rotation',
            help: 'How fast the whole wheel spins, degrees per second. Negative reverses. Slow keeps it hypnotic.' }),
  churn: z.number().min(0).max(12).default(2.5)
    .meta({ section: 'Motion', ui: 'slider', min: 0, max: 12, step: 0.5, label: 'Churn',
            help: 'Extra degrees per second added per layer, so layers drift apart at different rates. This differential IS the moire churn — 0 freezes the pattern.' }),
  breathe: z.number().min(0).max(1).default(0.2)
    .meta({ section: 'Motion', ui: 'slider', min: 0, max: 1, step: 0.05, label: 'Breathe',
            help: 'How much the spiral tightness slowly swells and relaxes (a ~24s cycle). 0 = steady; a little makes the wheel appear to breathe.' }),

  color: z.object({
    mode: z.enum(['duotone', 'spectrum']).default('duotone')
      .meta({ ui: 'segmented', options: ['duotone', 'spectrum'], label: 'Mode',
              help: 'Duotone: one ink drawn XOR-style so overlapping arms cancel to the ground — the crispest moire. Spectrum: each layer a luminous color, overlaps adding into light.' }),
    background: hex6.default('#05060a')
      .meta({ ui: 'color', label: 'Background', help: 'The ground color, painted every frame.' }),
    ink: hex6.default('#e8f2ff')
      .meta({ ui: 'color', label: 'Ink color',
              showWhen: { field: 'mode', equals: 'duotone' },
              help: 'The single arm colour. Overlapping arms cancel toward the background — the classic XOR moire wheel.' }),
    hueDrift: z.number().min(0).max(60).default(3)
      .meta({ ui: 'slider', min: 0, max: 60, step: 1, label: 'Hue drift',
              showWhen: { field: 'mode', equals: 'duotone' },
              help: 'Degrees per second the ink hue slides around the wheel. 0 = fixed hue.' }),
    tints: z.array(hex8).min(1).max(6)
      .default(['#38d9ffcc', '#a479ffcc', '#ff5f9ecc', '#5effbdcc', '#ffd15ecc', '#ff8a4ccc'])
      .meta({ ui: 'colorList', label: 'Layer colors', min: 1, max: 6,
              showWhen: { field: 'mode', equals: 'spectrum' },
              help: 'Each layer takes one of these, cycling by index. Overlaps add into brighter light.' }),
  }).default({
    mode: 'duotone', background: '#05060a', ink: '#e8f2ff', hueDrift: 3,
    tints: ['#38d9ffcc', '#a479ffcc', '#ff5f9ecc', '#5effbdcc', '#ffd15ecc', '#ff8a4ccc'],
  }).meta({ section: 'Color', ui: 'group', label: 'Color' }),

  seed: z.number().int().default(87)
    .meta({ section: 'Advanced', collapsed: true, ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed gives every layer the same starting rotation, so a run reproduces exactly. A fresh visit rolls a new one.' }),
})

export type HypnowheelConfig = z.infer<typeof hypnowheelSchema>
