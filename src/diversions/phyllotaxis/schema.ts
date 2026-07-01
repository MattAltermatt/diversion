import { z } from 'zod'

// Nightglass — the gallery-tuned default: saturated jewel tones that read as
// backlit stained glass on a near-black plum ground. The "Faithful (Lajtoš)"
// palette preset flips this to the white-bg rainbow of the source video.
const NIGHTGLASS_STOPS = [
  '#5b2a86ff', '#3b5bdbff', '#2bb2c9ff', '#3fbf6fff', '#e8c24aff', '#e0568aff',
]

export const phyllotaxisSchema = z.object({
  count: z.number().int().min(200).max(3000).default(900)
    .meta({ section: 'Pattern', ui: 'slider', min: 200, max: 3000, step: 50, label: 'Florets',
            help: 'How many cells fill the seed head. ~900 keeps every spiral arm legible; '
                + 'far higher muddies the mesh into haze.' }),
  divergence: z.number().min(0).max(360).default(137.507)
    .meta({ section: 'Pattern', ui: 'number', step: 0.001, label: 'Divergence angle',
            help: 'The turn between successive florets, in degrees. 137.507° (the golden '
                + 'angle) is the magic value the spirals lock into; the sweep oscillates '
                + 'around it.' }),
  spacing: z.number().min(4).max(24).default(11)
    .meta({ section: 'Pattern', ui: 'slider', min: 4, max: 24, step: 0.5, label: 'Spacing',
            help: 'Pixels of radius per √k — larger spreads the head wider.' }),
  zoom: z.number().min(0.3).max(4).default(1)
    .meta({ section: 'Pattern', ui: 'slider', min: 0.3, max: 4, step: 0.1, label: 'Zoom',
            help: 'Scales the whole head about the centre. Zoom in (>1) with big overlapping '
                + 'leaves to dive into the spiral vortex; zoom out to see the full seed head.' }),
  jitter: z.number().min(0).max(1).default(0.15)
    .meta({ section: 'Pattern', ui: 'slider', min: 0, max: 1, step: 0.05, label: 'Jitter',
            help: 'A tiny seeded wobble on each floret so it loses its mechanical, '
                + 'CG-perfect regularity. 0 = perfectly regular.' }),
  renderMode: z.enum(['leaf', 'mesh']).default('leaf')
    .meta({ section: 'Form', ui: 'segmented', options: ['leaf', 'mesh'], label: 'Render as',
            help: 'leaf: each floret is a radial rounded rectangle that streams out from the '
                + 'centre and overlaps its neighbours (the source-video "flow" — short=petals, '
                + 'long=a bloom of spikes). mesh: a filled Voronoi tessellation of the florets.' }),
  leafLength: z.number().min(4).max(220).default(48)
    .meta({ section: 'Form', ui: 'slider', min: 4, max: 220, step: 2, label: 'Leaf length',
            showWhen: { field: 'renderMode', equals: 'leaf' },
            help: 'Radial length of each leaf. Short → overlapping petals (a pompom); long → '
                + 'thin needles streaming from the centre (a firework bloom).' }),
  leafWidth: z.number().min(1).max(60).default(14)
    .meta({ section: 'Form', ui: 'slider', min: 1, max: 60, step: 1, label: 'Leaf width',
            showWhen: { field: 'renderMode', equals: 'leaf' },
            help: 'Cross-radial width of each leaf. Narrow + long = spikes; wide = fat petals.' }),
  leafAlpha: z.number().min(0.05).max(1).default(0.8)
    .meta({ section: 'Form', ui: 'slider', min: 0.05, max: 1, step: 0.05, label: 'Leaf opacity',
            showWhen: { field: 'renderMode', equals: 'leaf' },
            help: 'Lower opacity lets overlapping leaves layer into a soft glow (the bloom look).' }),
  leafRound: z.number().min(0).max(1).default(0.5)
    .meta({ section: 'Form', ui: 'slider', min: 0, max: 1, step: 0.05, label: 'Leaf rounding',
            showWhen: { field: 'renderMode', equals: 'leaf' },
            help: 'Corner rounding of each leaf. 0 = hard rectangles, 1 = stadium/capsule.' }),
  leafShade: z.number().min(0).max(1).default(0)
    .meta({ section: 'Form', ui: 'slider', min: 0, max: 1, step: 0.05, label: 'Leaf shading',
            showWhen: { field: 'renderMode', equals: 'leaf' },
            help: 'Shades each leaf light-to-dark across a diagonal, so overlapping tiles read as '
                + 'folded 3D scales — turns a big-leaf head into a hypnotic spiral vortex. 0 = flat.' }),
  sizeGrow: z.number().min(0).max(1).default(0.55)
    .meta({ section: 'Form', ui: 'slider', min: 0, max: 1, step: 0.05, label: 'Grow outward',
            showWhen: { field: 'renderMode', equals: 'leaf' },
            help: 'How much each leaf grows as it travels away from the centre. In Flow motion '
                + 'this makes shapes swell as they stream off-screen. 0 = uniform size.' }),
  colorBy: z.enum(['index', 'radius']).default('index')
    .meta({ section: 'Color', ui: 'segmented', options: ['index', 'radius'], label: 'Color by',
            help: 'index: rainbow along the growth order (matches the video — arms become '
                + 'colour streams). radius: colour by distance from the centre.' }),
  motion: z.enum(['flow', 'sweep', 'still']).default('flow')
    .meta({ section: 'Motion', ui: 'segmented', options: ['flow', 'sweep', 'still'], label: 'Motion',
            help: 'flow: shapes are born at the centre and stream outward off-screen forever (a '
                + 'living fountain). sweep: a fixed seed head whose angle oscillates so it shatters '
                + 'and re-forms. still: a static seed head.' }),
  emitRate: z.number().min(2).max(200).default(28)
    .meta({ section: 'Motion', ui: 'slider', min: 2, max: 200, step: 2, label: 'Flow rate',
            showWhen: { field: 'motion', equals: 'flow' },
            help: 'New shapes emitted per second — how fast the fountain streams outward.' }),
  sweepAmp: z.number().min(0).max(6).default(0.9)
    .meta({ section: 'Motion', ui: 'slider', min: 0, max: 6, step: 0.1, label: 'Sweep amplitude',
            showWhen: { field: 'motion', equals: 'sweep' },
            help: 'How far the divergence angle drifts off golden, in degrees. The spirals '
                + 'shatter into a burst of radial slivers at the extremes and re-form at '
                + 'golden.' }),
  sweepPeriod: z.number().min(10).max(180).default(60)
    .meta({ section: 'Motion', ui: 'slider', min: 10, max: 180, step: 5, label: 'Sweep period',
            showWhen: { field: 'motion', equals: 'sweep' },
            help: 'Seconds for one full shatter-and-reform cycle. Higher = slower, calmer.' }),
  growSeconds: z.number().min(0).max(30).default(12)
    .meta({ section: 'Motion', ui: 'slider', min: 0, max: 30, step: 1, label: 'Grow-in',
            showWhen: { field: 'motion', equals: ['sweep', 'still'] },
            help: 'Seconds the seed head takes to accrete from the centre outward on load. '
                + '0 = appear instantly.' }),
  spin: z.number().min(-60).max(60).default(8)
    .meta({ section: 'Motion', ui: 'slider', min: -60, max: 60, step: 1, label: 'Spin',
            help: 'Continuous rotation of the whole head, in degrees/sec — the hypnotic winding '
                + 'seen in nearly every demo. 0 = no spin; negative = the other way.' }),
  speed: z.number().min(0.1).max(3).default(0.6)
    .meta({ section: 'Motion', ui: 'slider', min: 0.1, max: 3, step: 0.1, label: 'Speed',
            help: 'Global time scale (also scales spin & flow). Zen-slow by default.' }),
  strokeWidth: z.number().min(0).max(3).default(0.6)
    .meta({ section: 'Color', ui: 'slider', min: 0, max: 3, step: 0.1, label: 'Mesh lines',
            showWhen: { field: 'renderMode', equals: 'mesh' },
            help: 'Width of the lines between cells (the leaded-glass look). 0 = seamless '
                + 'filled cells, no lines.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0b0713')
    .meta({ section: 'Color', ui: 'color', label: 'Background' }),
  strokeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#05030a')
    .meta({ section: 'Color', ui: 'color', label: 'Mesh line color',
            showWhen: { field: 'renderMode', equals: 'mesh' },
            help: 'Colour of the cell borders. Only shows when Mesh lines > 0.' }),
  color: z.object({
    stops: z.array(z.string().regex(/^#[0-9a-fA-F]{8}$/)).min(2).max(8)
      .default(NIGHTGLASS_STOPS)
      .meta({ ui: 'colorList', label: 'Palette', min: 2, max: 8,
              help: 'Colours are evenly spaced and sampled across the florets (by index or '
                  + 'radius). Per-stop alpha lets the background glow through.' }),
  }).default({ stops: NIGHTGLASS_STOPS })
    .meta({ section: 'Color', ui: 'group', label: 'Palette' }),
  seed: z.number().int().default(1)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. Drives the jitter wobble. A shared link shows a fresh seed '
                + 'each visit; set one explicitly to reproduce an exact head.' }),
})

export type PhyllotaxisConfig = z.infer<typeof phyllotaxisSchema>
