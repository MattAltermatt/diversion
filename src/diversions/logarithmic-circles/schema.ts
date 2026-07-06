import { z } from 'zod'

const hex6 = z.string().regex(/^#[0-9a-fA-F]{6}$/)

export const logCirclesSchema = z.object({
  ringGrowth: z.number().min(2).max(8).default(4.1)
    .meta({ section: 'Pattern', ui: 'slider', min: 2, max: 8, step: 0.1, label: 'Ring growth',
            help: 'Size ratio between one ring of circles and the next. Low = many small rings; high = dramatic size jumps.' }),
  circlesPerRing: z.number().int().min(3).max(16).default(8)
    .meta({ section: 'Pattern', ui: 'slider', min: 3, max: 16, step: 1, label: 'Circles per ring',
            help: 'How many circles are spaced around each ring.' }),
  circleSize: z.number().min(0.1).max(0.48).default(0.32)
    .meta({ section: 'Pattern', ui: 'slider', min: 0.1, max: 0.48, step: 0.01, label: 'Circle size',
            help: 'Disc radius as a fraction of the gap between rings. High = circles touch and merge.' }),
  layers: z.number().int().min(1).max(2).default(2)
    .meta({ section: 'Pattern', ui: 'slider', min: 1, max: 2, step: 1, label: 'Layers',
            help: 'Interleaved copies that fill the gaps. 2 = the dense packed look; 1 = sparse.' }),

  zoomSpeed: z.number().min(0).max(1.5).default(0.35)
    .meta({ section: 'Motion', ui: 'slider', min: 0, max: 1.5, step: 0.01, label: 'Zoom speed',
            help: 'How fast the field zooms. 0 = frozen. Calm by default.' }),
  direction: z.enum(['in', 'out']).default('out')
    .meta({ section: 'Motion', ui: 'segmented', options: ['in', 'out'], label: 'Direction',
            help: 'Circles emerge at the center and grow outward (out), or fall inward (in).' }),
  rotateSpeed: z.number().min(0).max(1).default(0.15)
    .meta({ section: 'Motion', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Rotate speed',
            help: 'Slow global spin, independent of zoom. 0 = no rotation.' }),

  color: z.object({
    mode: z.enum(['mono', 'color']).default('mono')
      .meta({ ui: 'segmented', options: ['mono', 'color'], label: 'Mode',
              help: 'Mono: faithful black & white. Color: circles cycle a gallery palette.' }),
    background: hex6.default('#000000')
      .meta({ ui: 'color', label: 'Background', help: 'The ground color, painted every frame.' }),
    fg: hex6.default('#ffffff')
      .meta({ ui: 'color', label: 'Circle color', showWhen: { field: 'mode', equals: 'mono' },
              help: 'The two-tone circle color; circles flip between this and the background in a spiral.' }),
    tints: z.array(hex6).min(1).max(8)
      .default(['#37d6ff', '#8a7bff', '#ff5fa2', '#5effc4', '#ffd166'])
      .meta({ ui: 'colorList', label: 'Palette', min: 1, max: 8,
              showWhen: { field: 'mode', equals: 'color' },
              help: 'Circles cycle these by ring and cell.' }),
    scanlines: z.number().min(0).max(0.3).default(0.1)
      .meta({ ui: 'slider', min: 0, max: 0.3, step: 0.01, label: 'Scanlines',
              help: 'Faint horizontal line texture in the gaps. 0 = clean.' }),
    centerDots: z.boolean().default(true)
      .meta({ ui: 'toggle', label: 'Center dots',
              help: 'The small dot that pulses in the middle of each circle.' }),
  }).default({
    mode: 'mono', background: '#000000', fg: '#ffffff',
    tints: ['#37d6ff', '#8a7bff', '#ff5fa2', '#5effc4', '#ffd166'],
    scanlines: 0.1, centerDots: true,
  }).meta({ section: 'Color', ui: 'group', label: 'Color' }),
})

export type LogCirclesConfig = z.infer<typeof logCirclesSchema>
