import { z } from 'zod'

export const langtonsLoopsSchema = z.object({
  cellSize: z.number().int().min(2).max(16).default(10)
    .meta({ section: 'Field', ui: 'slider', min: 2, max: 16, step: 1, label: 'Cell size',
            help: 'Pixel size of each automaton cell. Small = many tiny loops filling the plane; large = a few bold, legible colonies.' }),
  seeds: z.number().int().min(1).max(6).default(2)
    .meta({ section: 'Field', ui: 'slider', min: 1, max: 6, step: 1, label: 'Seed loops',
            help: 'How many starter loops are planted each generation. 1 = watch a single colony spread from the centre; more = multiple fronts, a faster, busier fill.' }),
  speed: z.number().min(2).max(20).default(8)
    .meta({ section: 'Motion', ui: 'slider', min: 2, max: 20, step: 1, label: 'Speed',
            help: 'Cellular-automaton steps per second. Low and slow is the zen default — you can follow a construction arm extending.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#06080d')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'The empty-space colour (state 0) behind the loops.' }),
  sheath: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#1f7a8c')
    .meta({ section: 'Color', ui: 'color', label: 'Sheath',
            help: 'Colour of the loop walls (state 2) — the structural “coral” you see everywhere.' }),
  signal: z.object({
    hueStart: z.number().min(0).max(360).default(40)
      .meta({ ui: 'slider', min: 0, max: 360, step: 1, label: 'Signal hue start',
              help: 'Where the signal colour ring begins on the hue wheel (degrees).' }),
    hueSpan: z.number().min(0).max(360).default(260)
      .meta({ ui: 'slider', min: 0, max: 360, step: 1, label: 'Signal hue span',
              help: 'How much of the hue wheel the six signal colours cover.' }),
    saturation: z.number().min(0).max(100).default(78)
      .meta({ ui: 'slider', min: 0, max: 100, step: 1, label: 'Signal saturation',
              help: 'Intensity of the signal colours coursing inside the loops.' }),
    lightness: z.number().min(0).max(100).default(66)
      .meta({ ui: 'slider', min: 0, max: 100, step: 1, label: 'Signal lightness',
              help: 'Brightness of the signals. Kept above the sheath so activity reads as the brightest thing on screen.' }),
  }).default({ hueStart: 40, hueSpan: 260, saturation: 78, lightness: 66 })
    .meta({ section: 'Color', ui: 'group', label: 'Signals' }),
  seed: z.number().int().default(42)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed regenerates the same loop orientations and reseed sequence. A fresh visit rolls a new one.' }),
})

export type LangtonsLoopsConfig = z.infer<typeof langtonsLoopsSchema>
