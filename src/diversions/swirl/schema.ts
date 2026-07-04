import { z } from 'zod'

const hex6 = z.string().regex(/^#[0-9a-fA-F]{6}$/)

// Swirl (xscreensaver `swirl`, GH #95). Several luminous spiral "knots" — each a
// spiral SOURCE at its own drifting centre, throwing off many fine spiral arms
// (logarithmic or Archimedean) that wind out from the centre and overlap the arms
// of the neighbouring sources. The arms are drawn as thin, glowing filaments whose
// hue slides from centre to rim, layered additively over a dark ground so the
// crossings light up into a swirling, marbled, nebula-like tapestry. The whole
// field rotates slowly and the centres wander, so the knots churn and interweave
// forever; a long, gentle reseed refreshes the arrangement.
export const swirlSchema = z.object({
  centers: z.number().int().min(2).max(5).default(4)
    .meta({ section: 'Spirals', ui: 'slider', min: 2, max: 5, step: 1, label: 'Centres',
            help: 'How many spiral sources churn the field. Each throws off its own fan of arms; more centres = a denser, more knotted weave where their arms overlap.' }),
  armsPerCenter: z.number().int().min(3).max(24).default(18)
    .meta({ section: 'Spirals', ui: 'slider', min: 3, max: 24, step: 1, label: 'Arms / centre',
            help: 'Spiral arms fanned evenly around each centre. Few = a bold pinwheel; many = a fine luminous grating that reads as smoke.' }),
  spiralTightness: z.number().min(0.5).max(6).default(4.5)
    .meta({ section: 'Spirals', ui: 'slider', min: 0.5, max: 6, step: 0.05, label: 'Tightness',
            help: 'Turns each arm winds from centre to rim. Near 0.5 = a loose swirl; high = a tightly coiled knot. Raises how hard the arms interweave.' }),
  spiralType: z.enum(['log', 'archimedean']).default('log')
    .meta({ section: 'Spirals', ui: 'segmented', options: ['log', 'archimedean'], label: 'Spiral type',
            help: 'Log: arms crowd near the centre and open toward the rim — a galactic, whirlpool coil. Archimedean: evenly spaced turns — a steady clock-spring.' }),
  spread: z.number().min(0.1).max(0.55).default(0.34)
    .meta({ section: 'Spirals', ui: 'slider', min: 0.1, max: 0.55, step: 0.01, label: 'Reach',
            help: 'How far each spiral reaches, as a fraction of the screen. Larger reach makes neighbouring knots overlap and interweave more.' }),

  rotationSpeed: z.number().min(-20).max(20).default(3)
    .meta({ section: 'Motion', ui: 'slider', min: -20, max: 20, step: 0.5, label: 'Rotation',
            help: 'How fast the whole field turns, degrees per second. Negative reverses. Slow keeps it hypnotic.' }),
  swirlSpeed: z.number().min(-30).max(30).default(6)
    .meta({ section: 'Motion', ui: 'slider', min: -30, max: 30, step: 0.5, label: 'Arm spin',
            help: 'Extra degrees per second each source spins its own arms, so the knots wind up relative to the field. 0 freezes the arms mid-swirl.' }),
  drift: z.number().min(0).max(1).default(0.4)
    .meta({ section: 'Motion', ui: 'slider', min: 0, max: 1, step: 0.05, label: 'Drift',
            help: 'How far the centres wander from their home spots (a slow, bounded orbit). 0 pins them; a little makes the knots slide past each other.' }),
  reseedSeconds: z.number().min(0).max(180).default(60)
    .meta({ section: 'Motion', ui: 'slider', min: 0, max: 180, step: 5, label: 'Reseed',
            help: 'Seconds between gentle reshuffles of the whole arrangement (crossfaded, never a hard cut). 0 = never reseed — pure endless drift.' }),

  lineWidth: z.number().min(0.5).max(4).default(1.2)
    .meta({ section: 'Look', ui: 'slider', min: 0.5, max: 4, step: 0.1, label: 'Filament width',
            help: 'Thickness of the spiral filaments, in pixels. Thin reads as fine smoke; thick as bold ribbons.' }),
  glow: z.number().min(0).max(1).default(0.55)
    .meta({ section: 'Look', ui: 'slider', min: 0, max: 1, step: 0.05, label: 'Glow',
            help: 'Strength of the soft halo drawn under each filament. More glow makes the crossings bloom into luminous nodes; too much can wash out — dark ground keeps the jewel colour.' }),

  color: z.object({
    mode: z.enum(['spectrum', 'palette']).default('spectrum')
      .meta({ ui: 'segmented', options: ['spectrum', 'palette'], label: 'Colour',
              help: 'Spectrum: hue sweeps the full wheel across centre→rim and per centre — a jewel rainbow. Palette: filaments take colours interpolated from your own stops.' }),
    background: hex6.default('#04050b')
      .meta({ ui: 'color', label: 'Background', help: 'The dark ground, painted every frame. Deep and near-black keeps the filaments luminous.' }),
    radialHue: z.number().min(0).max(360).default(140)
      .meta({ ui: 'slider', min: 0, max: 360, step: 5, label: 'Hue span',
              help: 'How many degrees the hue slides from a filament’s centre to its rim. 0 = one colour per arm; larger = a marbled, ink-in-water gradient along each filament.' }),
    colorCycle: z.number().min(0).max(30).default(5)
      .meta({ ui: 'slider', min: 0, max: 30, step: 0.5, label: 'Colour cycle',
              help: 'Degrees per second the whole palette slides around the wheel, so the jewel colours breathe over time. 0 = fixed.' }),
    palette: z.array(hex6).min(2).max(6)
      .default(['#3a0ca3', '#7209b7', '#f72585', '#4cc9f0', '#4361ee'])
      .meta({ ui: 'colorList', label: 'Palette', min: 2, max: 6,
              showWhen: { field: 'mode', equals: 'palette' },
              help: 'Filament colours, interpolated across centre→rim and cycled over time. Overlaps add into brighter light.' }),
  }).default({
    mode: 'spectrum', background: '#04050b', radialHue: 140, colorCycle: 5,
    palette: ['#3a0ca3', '#7209b7', '#f72585', '#4cc9f0', '#4361ee'],
  }).meta({ section: 'Color', ui: 'group', label: 'Color' }),

  seed: z.number().int().default(95)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed lays the centres down identically, so a run reproduces exactly. A fresh visit rolls a new one.' }),
})

export type SwirlConfig = z.infer<typeof swirlSchema>
