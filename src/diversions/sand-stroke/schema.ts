import { z } from 'zod'

const DEFAULT_PALETTE_COLORS = ['#7c3f1eff', '#c8762fff', '#e0a458ff', '#9c5a3cff', '#3a4a6bff', '#b0402eff']
const DEFAULT_GRADIENT_STOPS = ['#7c3f1eff', '#c8762fff', '#3a4a6bff']

export const sandStrokeSchema = z.object({
  strokes: z.number().int().min(4).max(80).default(4)
    .meta({ section: 'Strokes', ui: 'slider', min: 4, max: 80, step: 1, label: 'Strokes',
            help: 'Number of parallel horizontal sweeps laying sand across the canvas.' }),
  speed: z.number().min(0.2).max(4).default(0.2)
    .meta({ section: 'Strokes', ui: 'slider', min: 0.2, max: 4, step: 0.1, label: 'Speed',
            help: 'How fast a sweep crosses the canvas. Seconds-to-cross is proportional to 1/speed.' }),
  bandHeight: z.number().min(0.02).max(0.4).default(0.17)
    .meta({ section: 'The Wave', ui: 'slider', min: 0.02, max: 0.4, step: 0.01, label: 'Band height',
            help: 'Maximum half-thickness of a sweep’s sand column, as a fraction of canvas height.' }),
  waviness: z.number().min(0.005).max(0.12).default(0.02)
    .meta({ section: 'The Wave', ui: 'slider', min: 0.005, max: 0.12, step: 0.001, label: 'Waviness',
            help: 'How fast a sweep’s thickness wanders. Low ≈ near-constant ribbons; high = busy waves.' }),
  density: z.number().int().min(40).max(400).default(200)
    .meta({ section: 'Grain', ui: 'slider', min: 40, max: 400, step: 10, label: 'Grain density',
            help: 'Grains per side per column. More = denser, smoother bands (and a little slower).' }),
  opacity: z.number().min(0.02).max(0.3).default(0.1)
    .meta({ section: 'Grain', ui: 'slider', min: 0.02, max: 0.3, step: 0.005, label: 'Grain opacity',
            help: 'Alpha at the dense spine of a column; grains feather toward ~0 at the band edges.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#f4efe4')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'The ground colour. The painting is never cleared, so this is painted once.' }),
  color: z.object({
    mode: z.enum(['palette', 'gradient']).default('palette')
      .meta({ ui: 'segmented', options: ['palette', 'gradient'], label: 'Mode',
              help: 'Palette: each sweep picks one random colour. '
                  + 'Gradient: colour is sampled along a source (lane or progress).' }),
    colors: z.array(z.string().regex(/^#[0-9a-fA-F]{8}$/)).min(1).max(8)
      .default(DEFAULT_PALETTE_COLORS)
      .meta({ ui: 'colorList', label: 'Colors', min: 1, max: 8,
              showWhen: { field: 'mode', equals: 'palette' },
              help: 'Each sweep picks one colour at random per pass. A colour’s alpha multiplies '
                  + 'the grain falloff — leave at ff for the faithful look, lower it to thin a colour.' }),
    source: z.enum(['y', 'x']).default('y')
      .meta({ ui: 'segmented', options: ['y', 'x'], label: 'Gradient source',
              showWhen: { field: 'mode', equals: 'gradient' },
              help: 'What maps onto the gradient: y (a sweep’s lane height) or x (column progress L→R).' }),
    stops: z.array(z.string().regex(/^#[0-9a-fA-F]{8}$/)).min(2).max(8)
      .default(DEFAULT_GRADIENT_STOPS)
      .meta({ ui: 'colorList', label: 'Gradient stops', min: 2, max: 8,
              showWhen: { field: 'mode', equals: 'gradient' },
              help: 'Evenly spaced and sampled along the source; per-stop alpha multiplies grain build-up.' }),
  }).default({
    mode: 'palette',
    colors: DEFAULT_PALETTE_COLORS,
    source: 'y',
    stops: DEFAULT_GRADIENT_STOPS,
  }).meta({ section: 'Color', ui: 'group', label: 'Color' }),
  colorDrift: z.number().int().min(0).max(100).default(21)
    .meta({ section: 'Color', ui: 'slider', min: 0, max: 100, step: 1, label: 'Color drift',
            help: 'Chance a sweep recolours mid-pass near a flat point (palette mode). 0 = one colour per pass.' }),
  seed: z.number().int().default(4823)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed',
            help: 'Any integer. The same seed regenerates the same lanes, colours and wave character.' }),
})

export type SandStrokeConfig = z.infer<typeof sandStrokeSchema>
