import { z } from 'zod'

// Diffusion-Limited Aggregation: particles random-walk from a birth circle and
// freeze the instant they touch the growing cluster. Out of pure noise an
// intricate fractal dendrite assembles itself — frost, coral, lightning. One
// schema drives the form, the URL codec, and the Config type. Two preset axes
// (Growth = seed + walk feel, Look = render treatment + palette) live in presets.ts.
export const dlaSchema = z.object({
  // ─── The Growth ─────────────────────────────────────────────────────────────
  seedType: z.enum(['point', 'ring', 'line']).default('point')
    .meta({ section: 'The Growth', ui: 'segmented', options: ['point', 'ring', 'line'],
            label: 'Seed',
            help: 'What the first frozen particle looks like. point → a radial coral / frost star · '
                + 'ring → growth closes into a snowflake-like rosette · line → a bilateral hedge of spires.' }),
  // ★ hero knob: sticking probability sets how feathery vs dense the dendrite reads.
  stickProb: z.number().min(0.02).max(1).default(1)
    .meta({ section: 'The Growth', ui: 'slider', min: 0.02, max: 1, step: 0.02, label: 'Stickiness',
            help: 'Chance a wandering particle freezes on first contact. 1 = feathery, open '
                + 'dendrites (the exposed tips screen the interior, so it stays fractal). Lower = '
                + 'particles rattle deeper into the crevices before sticking → denser, chunkier growth.' }),
  driftBias: z.number().min(0).max(1).default(0)
    .meta({ section: 'The Growth', ui: 'slider', min: 0, max: 1, step: 0.02, label: 'Drift',
            help: 'A downward pull on every walker, like gravity or a breeze. 0 = symmetric radial '
                + 'growth · higher = the cluster leans and reaches, growing directional, wind-swept dendrites.' }),
  speed: z.number().min(20).max(1200).default(360)
    .meta({ section: 'The Growth', ui: 'slider', min: 20, max: 1200, step: 20, label: 'Growth rate',
            help: 'Particles frozen per second (frame-rate independent). Low = a slow, zen accretion '
                + 'you can watch grain by grain; high = it assembles and refills faster.' }),

  // ─── Render ─────────────────────────────────────────────────────────────────
  particleSize: z.number().min(0.6).max(2.6).default(1.15)
    .meta({ section: 'Render', ui: 'slider', min: 0.6, max: 2.6, step: 0.05, label: 'Grain size',
            help: 'Radius of each frozen particle. Small = fine, wispy filaments; large = fatter, '
                + 'more solid branches (they merge into thicker coral).' }),
  glow: z.number().min(0).max(1).default(0.35)
    .meta({ section: 'Render', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Glow',
            help: 'Soft bloom around the whole structure. 0 = crisp, mineral. High = neon frost / '
                + 'bioluminescent coral. Costs a little framerate.' }),

  // ─── Color ──────────────────────────────────────────────────────────────────
  colorByAge: z.boolean().default(true)
    .meta({ section: 'Color', ui: 'toggle', label: 'Color by growth',
            help: 'On: the palette cycles outward with arrival time, so the growth history glows as '
                + 'concentric rings from the seed. Off: one ink color for the whole cluster.' }),
  bands: z.number().int().min(1).max(16).default(5)
    .meta({ section: 'Color', ui: 'slider', min: 1, max: 16, step: 1, label: 'Rings',
            help: 'How many full palette cycles the growth passes through end to end (only affects '
                + '"Color by growth"). More = tighter, thinner rings.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#04060d')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'Canvas color behind the structure.' }),
  colors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(1).max(8)
    .default(['#0a2f52', '#1f7fc0', '#57d6f2', '#eafcff'])
    .meta({ section: 'Color', ui: 'colorList', label: 'Palette', min: 1, max: 8,
            help: 'Ordered seed → outermost growth. Cycles for the rings; "Color by growth" off uses '
                + 'the last color.' }),

  seed: z.number().int().default(3)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true, collapsed: true,
            help: 'Any integer. Same seed regrows the same structure. A fresh visit rolls a new one.' }),
})

export type DLAConfig = z.infer<typeof dlaSchema>
