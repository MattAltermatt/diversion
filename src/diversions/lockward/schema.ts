import { z } from 'zod'

const hex6 = z.string().regex(/^#[0-9a-fA-F]{6}$/)

// Lockward (xscreensaver `lockward`, GH #110). Concentric rings of radial blades —
// a luminous stained-glass rose window / nested clockwork. Each ring is divided into
// an even number of equal angular blades and spins at its own seed-picked speed;
// neighbouring rings COUNTER-rotate (alternating sign), so the blade boundaries sweep
// past each other in an interlocking churn. Colour cycles slowly around the wheel;
// an optional soft glow blooms each blade. Clean-room, gallery-grade. Calm defaults.
export const lockwardSchema = z.object({
  ringCount: z.number().int().min(3).max(10).default(6)
    .meta({ section: 'Rings', ui: 'slider', min: 3, max: 10, step: 1, label: 'Rings',
            help: 'How many concentric blade-rings, hub to rim. More rings = a finer, busier clockwork.' }),
  bladesMin: z.number().int().min(2).max(24).default(6)
    .meta({ section: 'Rings', ui: 'slider', min: 2, max: 24, step: 2, label: 'Blades — fewest',
            help: 'The lower bound on blades per ring. Each ring picks an even count in [fewest, most] from the seed (even so the two-color alternation closes seamlessly).' }),
  bladesMax: z.number().int().min(2).max(24).default(14)
    .meta({ section: 'Rings', ui: 'slider', min: 2, max: 24, step: 2, label: 'Blades — most',
            help: 'The upper bound on blades per ring. Widen the gap between fewest and most for rings of visibly different pitch.' }),
  hubRadius: z.number().min(0).max(0.35).default(0.06)
    .meta({ section: 'Rings', ui: 'slider', min: 0, max: 0.35, step: 0.01, label: 'Hub hole',
            help: 'Radius of the empty centre, as a fraction of the disc. 0 fills to the middle; a small hole reads as a bearing.' }),
  gap: z.number().min(0).max(16).default(3)
    .meta({ section: 'Rings', ui: 'slider', min: 0, max: 16, step: 1, label: 'Ring gap',
            help: 'Pixels of dark space between successive rings. A little gap lets each ring read as its own disc; the glow blooms into it.' }),

  speed: z.number().min(0).max(60).default(12)
    .meta({ section: 'Motion', ui: 'slider', min: 0, max: 60, step: 1, label: 'Spin speed',
            help: 'Base rotation, degrees per second. Neighbouring rings turn opposite ways, so this is the churn rate. 0 = frozen clockwork.' }),
  speedVariation: z.number().min(0).max(1).default(0.6)
    .meta({ section: 'Motion', ui: 'slider', min: 0, max: 1, step: 0.05, label: 'Speed spread',
            help: 'How much each ring\'s speed differs from the base, 0 = every ring the same magnitude, 1 = wide spread. Spread keeps the blades from ever locking into one static moire.' }),

  glow: z.number().min(0).max(1).default(0.4)
    .meta({ section: 'Look', ui: 'slider', min: 0, max: 1, step: 0.05, label: 'Glow',
            help: 'Soft luminous bloom around each blade. 0 = crisp flat blades; higher blooms an additive halo into the ring gaps.' }),

  color: z.object({
    mode: z.enum(['spectrum', 'duotone']).default('spectrum')
      .meta({ ui: 'segmented', options: ['spectrum', 'duotone'], label: 'Mode',
              help: 'Spectrum: blades sweep the color wheel and the whole wheel drifts over time — kaleidoscopic. Duotone: two fixed inks alternate blade-to-blade — a stained-glass rose window.' }),
    background: hex6.default('#05060c')
      .meta({ ui: 'color', label: 'Background', help: 'The ground the rings sit on, painted every frame. Dark reads the luminous blades best.' }),
    colorCycle: z.number().min(0).max(30).default(6)
      .meta({ ui: 'slider', min: 0, max: 30, step: 1, label: 'Color cycle',
              showWhen: { field: 'mode', equals: 'spectrum' },
              help: 'Degrees per second the whole color wheel drifts. 0 = fixed hues; slow drift is the hypnotic slow-cycle.' }),
    colorA: hex6.default('#38d9ff')
      .meta({ ui: 'color', label: 'Ink A',
              showWhen: { field: 'mode', equals: 'duotone' },
              help: 'The color of the even blades. Set Ink B to the background for classic filled/empty spokes.' }),
    colorB: hex6.default('#ff5f9e')
      .meta({ ui: 'color', label: 'Ink B',
              showWhen: { field: 'mode', equals: 'duotone' },
              help: 'The color of the odd blades, alternating with Ink A around each ring.' }),
  }).default({
    mode: 'spectrum', background: '#05060c', colorCycle: 6,
    colorA: '#38d9ff', colorB: '#ff5f9e',
  }).meta({ section: 'Color', ui: 'group', label: 'Color' }),

  seed: z.number().int().default(110)
    .meta({ section: 'Advanced', collapsed: true, ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed gives the same blade counts, speeds and directions every run. A fresh visit rolls a new one; add ?seed=N to pin an exact clockwork.' }),
})

export type LockwardConfig = z.infer<typeof lockwardSchema>
