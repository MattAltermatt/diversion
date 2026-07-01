import { z } from 'zod'

export const substrateSchema = z.object({
  initialCracks: z.number().int().min(1).max(10).default(3)
    .meta({ section: 'Growth', ui: 'slider', min: 1, max: 10, step: 1, label: 'Initial cracks',
            help: 'How many seed cracks start each cycle on the empty canvas.' }),
  maxCracks: z.number().int().min(1).max(500).default(11)
    .meta({ section: 'Growth', ui: 'slider', min: 1, max: 500, step: 1, label: 'Max cracks',
            help: 'Cap on simultaneously-active cracks (not a stop condition). The network grows '
                + 'to this many and holds them, relocating each one when it hits something. '
                + 'Set low (even 1) for a sparse, meditative screensaver.' }),
  speed: z.number().min(5).max(200).default(13)
    .meta({ section: 'Growth', ui: 'slider', min: 5, max: 200, step: 1, label: 'Speed',
            help: 'How fast cracks advance, in pixels per second. Higher fills the canvas sooner.' }),
  branchJitter: z.number().min(0).max(8).default(2)
    .meta({ section: 'Growth', ui: 'slider', min: 0, max: 8, step: 0.5, label: 'Branch jitter',
            help: 'Random angle wobble (degrees) added to the ±90° right-angle branch when a crack relocates.' }),
  straightPct: z.number().int().min(0).max(100).default(80)
    .meta({ section: 'Growth', ui: 'slider', min: 0, max: 100, step: 1, label: 'Straight %',
            help: 'Share of cracks that grow straight; the rest curve along an arc. '
                + '100 = all straight (classic Substrate), 0 = all curved.' }),
  minRadius: z.number().int().min(10).max(400).default(25)
    .meta({ section: 'Growth', ui: 'slider', min: 10, max: 400, step: 5, label: 'Min curve radius',
            help: 'Tightest arc radius (px) a curved crack can take. Small = tight curls that loop into '
                + 'their own trail and stop.' }),
  maxRadius: z.number().int().min(20).max(800).default(400)
    .meta({ section: 'Growth', ui: 'slider', min: 20, max: 800, step: 5, label: 'Max curve radius',
            help: 'Loosest arc radius (px) a curved crack can take. Large = gentle, barely-there bends. '
                + '(If min exceeds max they are simply used as an unordered range.)' }),
  drawTime: z.number().min(1).default(5)
    .meta({ section: 'Lifecycle', ui: 'number', min: 1, step: 1, label: 'Draw time (minutes)',
            help: 'Minutes a network grows before it fades and a fresh one begins. Any number — '
                + 'set it to 60 to let it "make a city" over an hour. A saturated canvas resets sooner.' }),
  fadeTime: z.number().min(1).max(6).default(3)
    .meta({ section: 'Lifecycle', ui: 'slider', min: 1, max: 6, step: 0.5, label: 'Fade time',
            help: 'How long the finished painting takes to fade to the background before regrowing.' }),
  grainDensity: z.number().int().min(16).max(128).default(84)
    .meta({ section: 'Sand', ui: 'slider', min: 16, max: 128, step: 1, label: 'Grain density',
            help: 'Grains laid along each perpendicular ray. More = smoother, denser watercolour cells.' }),
  grainOpacity: z.number().min(0.02).max(0.3).default(0.135)
    .meta({ section: 'Sand', ui: 'slider', min: 0.02, max: 0.3, step: 0.005, label: 'Grain opacity',
            help: 'Alpha at a ray’s dense end; grains feather toward ~0 at the far (neighbour) end.' }),
  crackColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#2a2a2a')
    .meta({ section: 'Line', ui: 'color', label: 'Crack color',
            help: 'Colour of the thin dark ink line each crack draws as it grows.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#f4efe4')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'The ground colour, painted once and faded back to between cycles.' }),
  color: z.object({
    mode: z.enum(['palette', 'gradient']).default('palette')
      .meta({ ui: 'segmented', options: ['palette', 'gradient'], label: 'Mode',
              help: 'Palette: each crack picks one random wash colour. Gradient: colour sampled by start position.' }),
    colors: z.array(z.string().regex(/^#[0-9a-fA-F]{8}$/)).min(1).max(8)
      .default(['#7c3f1e33', '#c8762f33', '#e0a45833', '#3a4a6b33', '#9c5a3c33', '#b0402e33'])
      .meta({ ui: 'colorList', label: 'Colors', min: 1, max: 8,
              showWhen: { field: 'mode', equals: 'palette' },
              help: 'Each crack picks one of these for its watercolour wash. Alpha multiplies the grain build-up.' }),
    source: z.enum(['y', 'x']).default('y')
      .meta({ ui: 'segmented', options: ['y', 'x'], label: 'Gradient source',
              showWhen: { field: 'mode', equals: 'gradient' },
              help: 'What maps onto the gradient: a crack’s start y (top→bottom) or x (left→right).' }),
    stops: z.array(z.string().regex(/^#[0-9a-fA-F]{8}$/)).min(2).max(8)
      .default(['#3a4a6bff', '#c8762fff', '#7c3f1eff'])
      .meta({ ui: 'colorList', label: 'Gradient stops', min: 2, max: 8,
              showWhen: { field: 'mode', equals: 'gradient' },
              help: 'Evenly spaced and sampled along the source; per-stop alpha multiplies grain build-up.' }),
  }).default({
    mode: 'palette',
    colors: ['#7c3f1e33', '#c8762f33', '#e0a45833', '#3a4a6b33', '#9c5a3c33', '#b0402e33'],
    source: 'y',
    stops: ['#3a4a6bff', '#c8762fff', '#7c3f1eff'],
  }).meta({ section: 'Color', ui: 'group', label: 'Color' }),
  seed: z.number().int().default(2917)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed',
            help: 'Any integer. The same seed regenerates the same sequence of crack networks.' }),
})

export type SubstrateConfig = z.infer<typeof substrateSchema>
