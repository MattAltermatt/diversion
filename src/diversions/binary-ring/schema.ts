import { z } from 'zod'

const hex6 = z.string().regex(/^#[0-9a-fA-F]{6}$/)

// Binary Ring (xscreensaver `binaryring`, GH #101). A luminous radial "horizon" —
// concentric rings, each subdivided into equal arc segments, lit by an evolving
// BINARY pattern. Each ring is its own little counter: segment j is bright iff bit
// j of that ring's value is set, so a ring literally counts up in binary as the
// pattern evolves — low segments pulse fast, high segments drift slow (a radial
// binary clock). Adjacent rings counter-rotate; a warm chromatic glow blooms behind
// the whole disc like a rising sun on the horizon. Clean-room, gallery-grade,
// calm defaults.
export const binaryRingSchema = z.object({
  rings: z.number().int().min(3).max(12).default(8)
    .meta({ section: 'Structure', ui: 'slider', min: 3, max: 12, step: 1, label: 'Rings',
            help: 'How many concentric rings, hub to horizon. Each ring is an independent binary counter; more rings = a taller, finer sunburst.' }),
  segments: z.number().int().min(6).max(40).default(24)
    .meta({ section: 'Structure', ui: 'slider', min: 6, max: 40, step: 1, label: 'Segments',
            help: 'Arc segments around each ring — also the number of BITS the ring displays. Segment j lights when bit j of the ring\'s value is set; beyond 30 bits the pattern simply repeats around the ring.' }),
  hubRadius: z.number().min(0).max(0.3).default(0.05)
    .meta({ section: 'Structure', ui: 'slider', min: 0, max: 0.3, step: 0.01, label: 'Hub hole',
            help: 'Radius of the empty centre as a fraction of the disc. A small hole reads as the sun\'s core; 0 fills to the middle.' }),
  gap: z.number().min(0).max(12).default(2)
    .meta({ section: 'Structure', ui: 'slider', min: 0, max: 12, step: 1, label: 'Ring gap',
            help: 'Pixels of dark space between rings. A little gap lets each ring read on its own and gives the glow room to bloom.' }),

  pattern: z.enum(['binary', 'gray', 'xor']).default('binary')
    .meta({ section: 'Pattern', ui: 'segmented', options: ['binary', 'gray', 'xor'], label: 'Pattern',
            help: 'binary: each ring counts up in plain binary — low segments blink fast, high ones drift slow. gray: a Gray-code counter, so exactly one segment flips at a time (a smooth travelling pulse). xor: a Sierpinski/XOR gasket wrapped into rings — a static fractal sunburst that slowly rotates as it evolves.' }),
  evolveSpeed: z.number().min(0).max(40).default(4)
    .meta({ section: 'Pattern', ui: 'slider', min: 0, max: 40, step: 1, label: 'Evolve speed',
            help: 'How fast the counter advances, counts per second. The lowest segment of a ring toggles at this rate; each higher segment at half the one below. 0 freezes the pattern.' }),
  rotation: z.number().min(0).max(40).default(5)
    .meta({ section: 'Pattern', ui: 'slider', min: 0, max: 40, step: 1, label: 'Rotation',
            help: 'Base spin, degrees per second. Neighbouring rings turn opposite ways, so bright arcs sweep past each other. 0 = a still ring-clock.' }),

  glow: z.number().min(0).max(1).default(0.55)
    .meta({ section: 'Look', ui: 'slider', min: 0, max: 1, step: 0.05, label: 'Glow',
            help: 'Intensity of the warm radial "horizon" haze behind the rings AND the soft additive bloom on each lit segment. 0 = crisp flat segments on black; higher = a luminous rising-sun glow.' }),

  color: z.object({
    mode: z.enum(['warm-horizon', 'spectrum', 'duotone']).default('warm-horizon')
      .meta({ ui: 'segmented', options: ['warm-horizon', 'spectrum', 'duotone'], label: 'Mode',
              help: 'warm-horizon: lit segments run from a white-gold core out to deep-red rim — a sun on the horizon. spectrum: segments sweep the colour wheel and the whole wheel drifts. duotone: two fixed inks alternate ring-and-segment.' }),
    background: hex6.default('#04060d')
      .meta({ ui: 'color', label: 'Background', help: 'The night the rings sit on, painted every frame. Deep and dark reads the glow best.' }),
    colorCycle: z.number().min(0).max(30).default(6)
      .meta({ ui: 'slider', min: 0, max: 30, step: 1, label: 'Colour cycle',
              showWhen: { field: 'mode', equals: 'spectrum' },
              help: 'Degrees per second the colour wheel drifts. 0 = fixed hues; a slow drift is the hypnotic slow-cycle.' }),
    colorA: hex6.default('#ffcf5c')
      .meta({ ui: 'color', label: 'Ink A',
              showWhen: { field: 'mode', equals: 'duotone' },
              help: 'Colour of the even lit segments.' }),
    colorB: hex6.default('#ff4d5e')
      .meta({ ui: 'color', label: 'Ink B',
              showWhen: { field: 'mode', equals: 'duotone' },
              help: 'Colour of the odd lit segments, alternating with Ink A.' }),
  }).default({
    mode: 'warm-horizon', background: '#04060d', colorCycle: 6,
    colorA: '#ffcf5c', colorB: '#ff4d5e',
  }).meta({ section: 'Color', ui: 'group', label: 'Color' }),

  seed: z.number().int().default(101)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed gives the same ring rates, offsets and spin directions every run. A fresh visit rolls a new one; add ?seed=N to pin an exact horizon.' }),
})

export type BinaryRingConfig = z.infer<typeof binaryRingSchema>
