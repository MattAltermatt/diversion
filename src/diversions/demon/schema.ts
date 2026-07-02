import { z } from 'zod'

export const demonSchema = z.object({
  field: z.enum(['square', 'hexagon', 'triangle']).default('hexagon')
    .meta({ section: 'Field', ui: 'segmented', options: ['square', 'hexagon', 'triangle'], label: 'Field',
            help: 'Grid shape. Square has 4 neighbors, hexagon 6, triangle 3 — fewer neighbors makes coarser, noisier spirals.' }),
  cellSize: z.number().int().min(4).max(24).default(10)
    .meta({ section: 'Field', ui: 'slider', min: 4, max: 24, step: 1, label: 'Cell size',
            help: 'Pixel size of each cell. Small = fine detailed spirals; large = bold and chunky.' }),
  colors: z.number().int().min(3).max(16).default(8)
    .meta({ section: 'Rules', ui: 'slider', min: 3, max: 16, step: 1, label: 'Colors',
            help: 'How many colors cycle. More colors = more spiral arms and finer demons.' }),
  dominanceReach: z.number().int().min(1).max(7).default(1)
    .meta({ section: 'Rules', ui: 'slider', min: 1, max: 7, step: 1, label: 'Dominance reach',
            help: 'How many colors each one eats around the ring. 1 = classic spiral demon; 2 = rock-paper-scissors-lizard-spock. Auto-limited to under half the colors.' }),
  threshold: z.number().int().min(1).max(2).default(1)
    .meta({ section: 'Rules', ui: 'slider', min: 1, max: 2, step: 1, label: 'Threshold',
            help: 'How many predator neighbors are needed before a cell flips. 1 = lively, ever-cycling spirals (the classic demon); 2 = broader, calmer domains that occasionally settle and refresh. Higher values freeze the CA, so the range stops at 2.' }),
  speed: z.number().min(2).max(30).default(8)
    .meta({ section: 'Motion', ui: 'slider', min: 2, max: 30, step: 1, label: 'Speed',
            help: 'Cellular-automaton steps per second. Low and slow is the zen default.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#05060a')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'The ground color behind the cells (shows at the grid edge margin).' }),
  color: z.object({
    hueStart: z.number().min(0).max(360).default(0)
      .meta({ ui: 'slider', min: 0, max: 360, step: 1, label: 'Hue start',
              help: 'Where the color ring begins on the hue wheel (degrees).' }),
    hueSpan: z.number().min(0).max(360).default(360)
      .meta({ ui: 'slider', min: 0, max: 360, step: 1, label: 'Hue span',
              help: 'How much of the hue wheel the colors cover. 360 = full rainbow; narrow = a tight, moody range.' }),
    saturation: z.number().min(0).max(100).default(70)
      .meta({ ui: 'slider', min: 0, max: 100, step: 1, label: 'Saturation',
              help: 'Color intensity. 0 = greyscale.' }),
    lightness: z.number().min(0).max(100).default(55)
      .meta({ ui: 'slider', min: 0, max: 100, step: 1, label: 'Lightness',
              help: 'How light the colors are.' }),
  }).default({ hueStart: 0, hueSpan: 360, saturation: 70, lightness: 55 })
    .meta({ section: 'Color', ui: 'group', label: 'Palette' }),
  seed: z.number().int().default(42)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed regenerates the same starting noise. A fresh visit rolls a new one.' }),
})

export type DemonConfig = z.infer<typeof demonSchema>
