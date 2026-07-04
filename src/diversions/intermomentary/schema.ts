import { z } from 'zod'

const hex6 = z.string().regex(/^#[0-9a-fA-F]{6}$/)
const hex8 = z.string().regex(/^#[0-9a-fA-F]{8}$/)

// InterMomentary (xscreensaver `intermomentary`, GH #109, after Gregory Barsamian's
// "Intersecting Momentary" effect). Equal circles are placed with their centers
// evenly spaced around one or more concentric RINGS (a circle of circles). The whole
// arrangement slowly rotates — each ring at its own rate — and the ring radii breathe,
// so where the circle OUTLINES cross, the crossing points trace shifting secondary
// rosettes: moire from circle intersections. Thin lines; the magic is the moving
// lattice of intersections. Calm, high-contrast defaults.
export const intermomentarySchema = z.object({
  circleCount: z.number().int().min(3).max(24).default(12)
    .meta({ section: 'Rings', ui: 'slider', min: 3, max: 24, step: 1, label: 'Circles per ring',
            help: 'How many equal circles are spaced evenly around each ring. Adjacent circles must overlap for intersections to weave — more circles per ring = a denser lattice of crossings.' }),
  ringCount: z.number().int().min(1).max(3).default(2)
    .meta({ section: 'Rings', ui: 'slider', min: 1, max: 3, step: 1, label: 'Rings',
            help: 'Concentric rings of circles, each at its own radius and rotating at its own rate. One ring already self-intersects; two or three beat against each other for richer moire.' }),
  circleRadius: z.number().min(20).max(300).default(120)
    .meta({ section: 'Rings', ui: 'slider', min: 20, max: 300, step: 1, label: 'Circle radius',
            help: 'Radius of each individual circle outline, in pixels. Larger circles overlap their neighbours more, so the intersection curves grow and interlock.' }),
  ringRadius: z.number().min(40).max(400).default(200)
    .meta({ section: 'Rings', ui: 'slider', min: 40, max: 400, step: 1, label: 'Ring radius',
            help: 'Radius of the outermost ring the circle centers sit on. Inner rings are inset from this. Tighter rings pull the circles into a busier overlap.' }),
  lineWidth: z.number().min(0.3).max(2).default(0.8)
    .meta({ section: 'Rings', ui: 'slider', min: 0.3, max: 2, step: 0.1, label: 'Line width',
            help: 'Circle outline thickness. Thin, crisp lines read the intersection lattice best.' }),

  rotationSpeed: z.number().min(0).max(0.6).default(0.12)
    .meta({ section: 'Motion', ui: 'slider', min: 0, max: 0.6, step: 0.01, label: 'Rotation speed',
            help: 'Radians per second the whole arrangement turns. 0 = frozen spin (the pulse still churns it). Slow rotation keeps the moire alive.' }),
  differential: z.number().min(0).max(0.6).default(0.18)
    .meta({ section: 'Motion', ui: 'slider', min: 0, max: 0.6, step: 0.01, label: 'Ring differential',
            help: 'How much faster each successive ring spins than the one outside it. 0 = every ring locked together (no beating); higher = rings slide against each other so the crossing pattern never repeats.' }),
  pulse: z.number().min(0).max(0.3).default(0.08)
    .meta({ section: 'Motion', ui: 'slider', min: 0, max: 0.3, step: 0.01, label: 'Radius pulse',
            help: 'How far the ring radii slowly breathe in and out (fraction of the ring radius). Gentle pulsing re-sizes the overlap so the interference churns forever, even at zero rotation.' }),

  color: z.object({
    mode: z.enum(['duotone', 'spectrum']).default('duotone')
      .meta({ ui: 'segmented', options: ['duotone', 'spectrum'], label: 'Mode',
              help: 'Duotone: two inks, one per alternating ring, added into light where circles cross. Spectrum: each circle takes a hue around the wheel for a rainbow rosette.' }),
    background: hex6.default('#05070d')
      .meta({ ui: 'color', label: 'Background', help: 'The ground colour, painted every frame.' }),
    inkA: hex8.default('#59e0ffcc')
      .meta({ ui: 'color', label: 'Ink A',
              showWhen: { field: 'mode', equals: 'duotone' },
              help: 'The outer / even-ring ink. Overlaps add into brighter light. Alpha tempers the additive blowout.' }),
    inkB: hex8.default('#ff6ab0cc')
      .meta({ ui: 'color', label: 'Ink B',
              showWhen: { field: 'mode', equals: 'duotone' },
              help: 'The inner / odd-ring ink. With one ring only Ink A shows; add a ring to see them beat.' }),
    saturation: z.number().min(0).max(100).default(85)
      .meta({ ui: 'slider', min: 0, max: 100, step: 1, label: 'Saturation',
              showWhen: { field: 'mode', equals: 'spectrum' },
              help: 'Colour intensity of the spectrum hues, percent. Lower drifts toward luminous white crossings.' }),
  }).default({
    mode: 'duotone', background: '#05070d',
    inkA: '#59e0ffcc', inkB: '#ff6ab0cc', saturation: 85,
  }).meta({ section: 'Color', ui: 'group', label: 'Color' }),

  highlightIntersections: z.boolean().default(true)
    .meta({ section: 'Color', ui: 'toggle', label: 'Highlight crossings',
            help: 'Brighten the exact points where two circle outlines cross with tiny sparks, so the moving intersection lattice reads as luminous nodes.' }),

  seed: z.number().int().default(109)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed sets each ring’s starting angle and spin direction identically every run. A fresh visit rolls a new one.' }),
})

export type IntermomentaryConfig = z.infer<typeof intermomentarySchema>
