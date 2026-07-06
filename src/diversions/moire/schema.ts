import { z } from 'zod'

const hex6 = z.string().regex(/^#[0-9a-fA-F]{6}$/)

export const moireSchema = z.object({
  centers: z.number().int().min(1).max(12).default(3)
    .meta({ section: 'Rings', ui: 'slider', min: 1, max: 12, step: 1, label: 'Centers',
            help: 'How many ring sources. Few = calm, spacious moire; more = busier interference.' }),
  ringSpacing: z.number().min(10).max(120).default(38)
    .meta({ section: 'Rings', ui: 'slider', min: 10, max: 120, step: 1, label: 'Ring spacing',
            help: 'Distance in pixels between successive rings from one center. Tighter = denser moire.' }),
  ringSpeed: z.number().min(2).max(80).default(18)
    .meta({ section: 'Rings', ui: 'slider', min: 2, max: 80, step: 1, label: 'Ring speed',
            help: 'How fast rings expand outward, pixels per second. Slow is calmer.' }),
  softness: z.number().min(0).max(1).default(0.6)
    .meta({ section: 'Rings', ui: 'slider', min: 0, max: 1, step: 0.02, label: 'Softness',
            help: '0 = crisp rings (op-art). 1 = soft bloom. Applied as one blur pass, so it is cheap at any value.' }),
  ringWidth: z.number().min(0.5).max(8).default(2)
    .meta({ section: 'Rings', ui: 'slider', min: 0.5, max: 8, step: 0.5, label: 'Ring width',
            help: 'Line thickness for Glow and Moire rings. (Solid fills the bands, so it ignores this.)' }),

  driftSpeed: z.number().min(0).max(40).default(6)
    .meta({ section: 'Motion', ui: 'slider', min: 0, max: 40, step: 1, label: 'Drift speed',
            help: 'How fast the centers wander, pixels per second. 0 = fixed centers. Slow drift keeps the moire alive.' }),
  breathAmount: z.number().min(0).max(1).default(0.25)
    .meta({ section: 'Motion', ui: 'slider', min: 0, max: 1, step: 0.02, label: 'Breath amount',
            help: 'Depth of the slow in/out pulse of ring expansion. 0 = steady ripples.' }),
  breathRate: z.number().min(1).max(30).default(6)
    .meta({ section: 'Motion', ui: 'slider', min: 1, max: 30, step: 1, label: 'Breath rate',
            help: 'Breaths per minute of the dilation pulse. Low = a slow, deep breath.' }),

  color: z.object({
    mode: z.enum(['glow', 'solid', 'xor']).default('glow')
      .meta({ ui: 'segmented', options: ['glow', 'solid', 'xor'], label: 'Mode',
              help: 'Glow: luminous color rings blended additively. Solid: filled rings that merge into a '
                  + 'bold 2-color parity field. XOR: thin duotone rings that cancel where they cross.' }),
    background: hex6.default('#05060a')
      .meta({ ui: 'color', label: 'Background', help: 'The ground color, painted every frame.' }),
    tints: z.array(z.string().regex(/^#[0-9a-fA-F]{8}$/)).min(1).max(8)
      .default(['#37d6ffff', '#8a7bffff', '#ff5fa2ff', '#5effc4ff', '#ffd166ff'])
      .meta({ ui: 'colorList', label: 'Ring colors', min: 1, max: 8,
              showWhen: { field: 'mode', equals: 'glow' },
              help: 'Each center takes one of these, cycling by index. Overlaps add into light.' }),
    fg: hex6.default('#9fe7ff')
      .meta({ ui: 'color', label: 'Ring color',
              showWhen: { field: 'mode', equals: ['solid', 'xor'] },
              help: 'The second duotone color, over the background. Solid: fills the odd-parity bands. XOR: rings that cancel where they cross.' }),
    hueCycle: z.number().min(0).max(60).default(6)
      .meta({ ui: 'slider', min: 0, max: 60, step: 1, label: 'Hue cycle',
              showWhen: { field: 'mode', equals: 'xor' },
              help: 'Degrees per second the ring color drifts around the wheel. 0 = fixed hue.' }),
  }).default({
    mode: 'glow', background: '#05060a',
    tints: ['#37d6ffff', '#8a7bffff', '#ff5fa2ff', '#5effc4ff', '#ffd166ff'],
    fg: '#9fe7ff', hueCycle: 6,
  }).meta({ section: 'Color', ui: 'group', label: 'Color' }),

  seed: z.number().int().default(1701)
    .meta({ section: 'Advanced', collapsed: true, ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed places centers and drift directions identically every run. A fresh visit rolls a new one.' }),
})

export type MoireConfig = z.infer<typeof moireSchema>
