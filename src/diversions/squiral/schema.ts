import { z } from 'zod'

export const squiralSchema = z.object({
  count: z.number().int().min(1).max(60).default(3)
    .meta({ section: 'Worms', ui: 'slider', min: 1, max: 60, step: 1, label: 'Worms',
            help: 'How many spiral-drawing worms crawl the grid at once. A few is calm and meditative; more fills faster.' }),
  speed: z.number().min(1).max(120).default(10)
    .meta({ section: 'Worms', ui: 'slider', min: 1, max: 120, step: 1, label: 'Speed',
            help: 'Worm steps per second. Low and slow is the zen default; higher = faster growth.' }),
  disorder: z.number().min(0).max(0.05).default(0)
    .meta({ section: 'Motion', ui: 'slider', min: 0, max: 0.05, step: 0.001, label: 'Disorder',
            help: 'Chance per step a worm randomly flips its winding direction. 0 = pristine spirals.' }),
  handedness: z.number().min(0).max(1).default(0.5)
    .meta({ section: 'Motion', ui: 'slider', min: 0, max: 1, step: 0.05, label: 'Handedness',
            help: 'Bias between left- and right-winding worms. 0 = all one way, 1 = all the other, 0.5 = mixed.' }),
  edges: z.enum(['wrap', 'walls']).default('wrap')
    .meta({ section: 'Motion', ui: 'segmented', options: ['wrap', 'walls'], label: 'Edges',
            help: 'Wrap: a worm crossing a screen edge reappears on the opposite side. '
                + 'Walls: a worm treats the edge like a wall and turns to follow it.' }),
  clearMode: z.enum(['fade', 'wipe', 'rolling']).default('rolling')
    .meta({ section: 'Lifecycle', ui: 'segmented', options: ['fade', 'wipe', 'rolling'], label: 'Clear mode',
            help: 'What happens when the grid fills: fade out and regrow, sweep from the edges, or continuously '
                + 'recycle the oldest cells so it never fully clears.' }),
  fillThreshold: z.number().int().min(20).max(95).default(75)
    .meta({ section: 'Lifecycle', ui: 'slider', min: 20, max: 95, step: 1, label: 'Fill %',
            help: 'Percent of the grid covered before a clear/recycle is triggered.' }),
  fadeTime: z.number().min(1).max(6).default(2.5)
    .meta({ section: 'Lifecycle', ui: 'slider', min: 1, max: 6, step: 0.5, label: 'Fade time',
            showWhen: { field: 'clearMode', equals: 'fade' },
            help: 'Seconds the field takes to fade to the background before regrowing (fade mode).' }),
  cellSize: z.number().int().min(2).max(12).default(4)
    .meta({ section: 'Cells', ui: 'slider', min: 2, max: 12, step: 1, label: 'Cell size',
            help: 'Pixel size of each grid cell. Small = fine intricate spirals; large = bold and chunky.' }),
  gap: z.number().int().min(0).max(3).default(0)
    .meta({ section: 'Cells', ui: 'slider', min: 0, max: 3, step: 1, label: 'Gap',
            help: 'Background-colored gutter between cells. 0 = solid mosaic; >0 = tessellated tiles.' }),
  cellStyle: z.enum(['square', 'ribbon']).default('square')
    .meta({ section: 'Cells', ui: 'segmented', options: ['square', 'ribbon'], label: 'Cell style',
            help: 'Square = crisp filled cells (sharp spiral corners). Ribbon = rounded, softer coils.' }),
  cycle: z.boolean().default(false)
    .meta({ section: 'Color', ui: 'toggle', label: 'Cycle colors',
            help: 'Advance each worm’s color as it winds, turning a coil into a shifting ribbon of hue.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0b1622')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'The ground color, painted once and faded back to between cycles.' }),
  color: z.object({
    mode: z.enum(['palette', 'gradient']).default('palette')
      .meta({ ui: 'segmented', options: ['palette', 'gradient'], label: 'Mode',
              help: 'Palette: each worm picks one color. Gradient: color sampled by position (or cycled).' }),
    colors: z.array(z.string().regex(/^#[0-9a-fA-F]{8}$/)).min(1).max(8)
      .default(['#2a5cf0ff', '#4d9bffff', '#ffc22eff', '#ffe08aff'])
      .meta({ ui: 'colorList', label: 'Colors', min: 1, max: 8,
              showWhen: { field: 'mode', equals: 'palette' },
              help: 'Each worm picks one of these (or cycles through them when Cycle colors is on).' }),
    source: z.enum(['y', 'x']).default('y')
      .meta({ ui: 'segmented', options: ['y', 'x'], label: 'Gradient source',
              showWhen: { field: 'mode', equals: 'gradient' },
              help: 'What maps onto the gradient: a cell’s y (top→bottom) or x (left→right).' }),
    stops: z.array(z.string().regex(/^#[0-9a-fA-F]{8}$/)).min(2).max(8)
      .default(['#0b1622ff', '#2a5cf0ff', '#ffe08aff'])
      .meta({ ui: 'colorList', label: 'Gradient stops', min: 2, max: 8,
              showWhen: { field: 'mode', equals: 'gradient' },
              help: 'Evenly spaced and sampled along the source (or cycled when Cycle colors is on).' }),
  }).default({
    mode: 'palette',
    colors: ['#2a5cf0ff', '#4d9bffff', '#ffc22eff', '#ffe08aff'],
    source: 'y',
    stops: ['#0b1622ff', '#2a5cf0ff', '#ffe08aff'],
  }).meta({ section: 'Color', ui: 'group', label: 'Color' }),
  seed: z.number().int().default(7411)
    .meta({ section: 'Advanced', collapsed: true, ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed regenerates the same sequence of spirals. A fresh visit rolls a new one.' }),
})

export type SquiralConfig = z.infer<typeof squiralSchema>
