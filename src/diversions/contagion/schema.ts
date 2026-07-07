import { z } from 'zod'

// A single perceptual ramp drives every cell. Index 0 is the resting, susceptible
// field (the dark ground); the top is the freshly-infected wavefront at its
// brightest. Recovering tissue fades down the ramp between them. Default "Bloom" —
// deep indigo ground → violet/magenta recovering tail → hot coral-white front, so
// infection waves glow across a dark field. (Cooler / toxic / BZ ramps live in
// presets.ts.)
const DEFAULT_PALETTE = [
  '#05060f', '#0b0a22', '#160e39', '#25124f', '#3a1563', '#531a70', '#711f77', '#912577',
  '#b12d70', '#cc3a63', '#e14e55', '#f0664f', '#f9835a', '#fea678', '#ffcaa2', '#fff0dd',
]

export const contagionSchema = z.object({
  // ── Grid ──
  cellSize: z.number().int().min(2).max(12).default(4)
    .meta({ section: 'Grid', ui: 'slider', min: 2, max: 12, step: 1, label: 'Cell size',
            help: 'Pixel size of each cell — smaller means a finer lattice and larger, more '
                + 'sweeping infection fronts.' }),
  neighborhood: z.enum(['Moore', 'Von Neumann']).default('Moore')
    .meta({ section: 'Grid', ui: 'segmented', options: ['Moore', 'Von Neumann'], label: 'Neighbourhood',
            help: 'Which cells count as neighbours a cell can catch from. Moore (8, incl. diagonals) '
                + 'gives rounder fronts and smoother spirals; Von Neumann (4) makes squarer, coarser waves.' }),

  // ── Epidemic ──
  transmission: z.number().min(0.05).max(1).default(0.35)
    .meta({ section: 'Epidemic', ui: 'slider', min: 0.05, max: 1, step: 0.01, label: 'Transmission (β)',
            help: 'Per-step chance one infected neighbour infects a susceptible cell. This is the '
                + 'R0 dial: low and a spark fizzles out; past the threshold it becomes a self-sustaining '
                + 'wavefront; near 1 the whole field ignites at once.' }),
  infectiousDuration: z.number().int().min(1).max(30).default(6)
    .meta({ section: 'Epidemic', ui: 'slider', min: 1, max: 30, step: 1, label: 'Infectious period',
            help: 'How many steps a cell stays infectious (and can spread) before it recovers. The '
                + 'bright band of the wave is this many cells wide.' }),
  immunityDuration: z.number().int().min(0).max(120).default(28)
    .meta({ section: 'Epidemic', ui: 'slider', min: 0, max: 120, step: 1, label: 'Immunity period',
            help: 'How long a recovered cell stays immune before it can catch again. 0 = permanent '
                + 'immunity (a classic SIR epidemic that burns out, then a fresh outbreak seeds). '
                + 'Higher (SIRS) lets immunity wane, so the field never fully burns out and resolves '
                + 'into endless spiral reinfection waves.' }),
  seedCount: z.number().int().min(1).max(40).default(6)
    .meta({ section: 'Epidemic', ui: 'slider', min: 1, max: 40, step: 1, label: 'Initial foci',
            help: 'How many separate points the infection is seeded from — at the start, and again '
                + 'whenever an outbreak burns out and a new one begins.' }),
  sparkRate: z.number().min(0).max(0.0001).default(0.00004)
    .meta({ section: 'Epidemic', ui: 'slider', min: 0, max: 0.0001, step: 0.000001, label: 'Reintroduction',
            help: 'Tiny per-cell chance each step that a susceptible cell spontaneously catches — '
                + 'background reintroduction from outside. This keeps the field alive: each stray spark '
                + 'grows into a wave that collides with others and breaks into spiral cores, so the '
                + 'whole plane stays populated instead of a lone front sweeping an empty field. 0 turns '
                + 'it off (pure seeded outbreaks).' }),

  // ── Motion ──
  speed: z.number().int().min(1).max(40).default(16)
    .meta({ section: 'Motion', ui: 'slider', min: 1, max: 40, step: 1, label: 'Speed',
            help: 'Simulation steps per second. The front advances one cell-ring per step, so lower '
                + 'is a calm, watchable spread.' }),
  smoothing: z.number().min(0).max(0.95).default(0.4)
    .meta({ section: 'Motion', ui: 'slider', min: 0, max: 0.95, step: 0.05, label: 'Smoothing',
            help: 'Phosphor-style trailing that eases each cell between its discrete state jumps '
                + 'instead of snapping — this is what tames flicker. 0 is the raw hard-edged automaton; '
                + 'higher is a smoother, more liquid glow (too high smears the crisp fronts).' }),

  // ── Color ──
  palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(2).max(16).default(DEFAULT_PALETTE)
    .meta({ section: 'Color', ui: 'colorList', min: 2, max: 16, label: 'Palette',
            help: 'The lowest colour is the resting susceptible field; the highest is the infection '
                + 'front at its peak. Recovering cells fade down through the ramp between them.' }),
  contrast: z.number().min(0.3).max(3).default(1.1)
    .meta({ section: 'Color', ui: 'slider', min: 0.3, max: 3, step: 0.1, label: 'Front contrast',
            help: 'Higher makes the bright wavefront thinner and the recovering tail darker; lower '
                + 'spreads the glow across the whole wave.' }),

  // ── Display ──
  showHud: z.boolean().default(true)
    .meta({ section: 'Display', ui: 'toggle', label: 'Epidemic curve',
            help: 'Show the live S / I / R stacked bar and the infected-fraction history — the '
                + 'epidemic curve breathing as waves sweep and recede.' }),

  // ── Advanced ──
  seed: z.number().int().default(1)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true, collapsed: true,
            help: 'Any integer. The same seed always replays the same outbreak. A shared link is '
                + 'seedless — every fresh visit seeds a different epidemic.' }),
})

export type ContagionConfig = z.infer<typeof contagionSchema>
