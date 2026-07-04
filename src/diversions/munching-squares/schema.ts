import { z } from 'zod'

// The rule variants of HAKMEM item 146. `auto` picks one from the per-load seed
// (so a fresh visit varies the flavour), the rest force a specific munch.
export const RULES = ['auto', 'line', 'fill', 'shift'] as const
export type Rule = (typeof RULES)[number]

// Where each lit cell reads its palette index from.
export const COLOR_MODES = ['xor', 'position', 'time'] as const
export type ColorMode = (typeof COLOR_MODES)[number]

export const munchingSquaresSchema = z.object({
  gridPower: z.number().int().min(5).max(8).default(6)
    .meta({ section: 'Grid', ui: 'slider', min: 5, max: 8, step: 1, label: 'Detail (grid size)',
            help: 'The grid is N×N with N = 2^this. 5 = 32 (bold and chunky), 6 = 64, 8 = 256 (fine, intricate). Cells stretch to fill the screen.' }),
  rule: z.enum(RULES).default('fill')
    .meta({ section: 'Rule', ui: 'segmented', options: [...RULES], label: 'Rule',
            help: 'The XOR munch. Fill = the iconic growing triangle (y < x XOR t) — the default. Line = a single folding diagonal (y = x XOR t). Shift = the line with a per-load phase offset. Auto picks one from the seed.' }),
  stepSpeed: z.number().min(1).max(40).default(10)
    .meta({ section: 'Rule', ui: 'slider', min: 1, max: 40, step: 1, label: 'Step speed',
            help: 'How fast the pattern folds — grid steps (t) per second. The munch loops every N steps. Low and slow is the zen default.' }),
  colorMode: z.enum(COLOR_MODES).default('xor')
    .meta({ section: 'Color', ui: 'segmented', options: [...COLOR_MODES], label: 'Color by',
            help: 'What drives each cell’s hue. XOR = the x XOR y texture (rich moiré on Fill). Position = a gradient across the grid. Time = one shifting hue for the whole pattern, pulsing as t advances.' }),
  colorSpeed: z.number().min(0).max(40).default(8)
    .meta({ section: 'Color', ui: 'slider', min: 0, max: 40, step: 1, label: 'Color cycle',
            help: 'Speed of the smooth hue drift over the palette. 0 holds the colors still; higher shimmers faster.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#05060a')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'The color behind unlit cells.' }),
  color: z.object({
    hueStart: z.number().min(0).max(360).default(200)
      .meta({ ui: 'slider', min: 0, max: 360, step: 1, label: 'Hue start',
              help: 'Where the palette begins on the hue wheel (degrees).' }),
    hueSpan: z.number().min(0).max(360).default(300)
      .meta({ ui: 'slider', min: 0, max: 360, step: 1, label: 'Hue span',
              help: 'How much of the hue wheel the palette sweeps. 360 = full rainbow; narrow = a tight, moody range.' }),
    saturation: z.number().min(0).max(100).default(85)
      .meta({ ui: 'slider', min: 0, max: 100, step: 1, label: 'Saturation',
              help: 'Color intensity. 0 = greyscale.' }),
    lightness: z.number().min(0).max(100).default(55)
      .meta({ ui: 'slider', min: 0, max: 100, step: 1, label: 'Lightness',
              help: 'How light the lit cells are.' }),
  }).default({ hueStart: 200, hueSpan: 300, saturation: 85, lightness: 55 })
    .meta({ section: 'Color', ui: 'group', label: 'Palette' }),
  seed: z.number().int().default(1)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. Rolls the Auto rule, the Shift offset, and the starting color phase. A fresh visit rolls a new one; a shared link pins it.' }),
})

export type MunchingSquaresConfig = z.infer<typeof munchingSquaresSchema>
