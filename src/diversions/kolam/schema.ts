import { z } from 'zod'
import { DEFAULTS } from './config'

// Kolam: a fixed drawing grammar (centre → registers → terminals → lace →
// kaavi) with generated content — the schema mirrors config.ts's KolamConfig
// field for field. Defaults are pulled from DEFAULTS rather than retyped, so
// `kolamSchema.parse({})` cannot drift from the shipped probe values (#363:
// a number authored twice in prose is how a mismatch survives a green suite).
//
// Two independent preset axes live in presets.ts: Ground (background +
// groundGrain) and Palette (palette + kaaviColor + colouredChalk).
const HEX6 = /^#[0-9a-fA-F]{6}$/

export const kolamSchema = z.object({
  // ── Composition ──
  symmetry: z.number().int().min(4).max(16).default(DEFAULTS.symmetry)
    .meta({ section: 'Composition', ui: 'slider', min: 4, max: 16, step: 2, label: 'Symmetry',
            help: 'How many identical wedges the kolam repeats around its centre. A kolam is '
                + 'always drawn with this many-fold rotational symmetry — never randomised, '
                + 'or the piece stops reading as a kolam.' }),
  registers: z.number().int().min(3).max(6).default(DEFAULTS.registers)
    .meta({ section: 'Composition', ui: 'slider', min: 3, max: 6, step: 1, label: 'Registers',
            help: 'The maximum number of concentric rings of motifs. Each drawing picks '
                + 'somewhere between 3 and this many — raising it only raises the ceiling.' }),
  density: z.number().min(0).max(1).default(DEFAULTS.density)
    .meta({ section: 'Composition', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Density',
            help: 'Overall fullness of the composition — how much of each register’s '
                + 'circumference its motifs and bands occupy.' }),

  // ── The hand ──
  strokesPerBundle: z.number().int().min(1).max(10).default(DEFAULTS.strokesPerBundle)
    .meta({ section: 'The hand', ui: 'slider', min: 1, max: 10, step: 1, label: 'Strokes per bundle',
            help: 'How many parallel offset passes draw each figure — the hand-repeated '
                + 'strokes that give a kolam line its soft, chalk-doubled look. 4 or more '
                + 'reads as a solid band; fewer reads as a single thickened line.' }),
  bundleSpacing: z.number().min(1).max(20).default(DEFAULTS.bundleSpacing)
    .meta({ section: 'The hand', ui: 'slider', min: 1, max: 20, step: 0.5, label: 'Bundle spacing',
            help: 'Gap between the parallel strokes in a bundle, as a multiple of Line width '
                + '(shipped ratio ≈ 3.68). That ratio governs bands only — bundles of '
                + '4 or more strokes; every other feature (centre, terminals, lace, motif '
                + 'rings) draws its 1–3 strokes at a much tighter spacing and reads as a '
                + 'single hand-doubled line, not a band.' }),
  lineWidth: z.number().min(0.5).max(5).default(DEFAULTS.lineWidth)
    .meta({ section: 'The hand', ui: 'slider', min: 0.5, max: 5, step: 0.1, label: 'Line width',
            help: 'Thickness of a single stroke pass. Bundle spacing above is normalised '
                + 'against this width — thin lines spread further apart relative to '
                + 'their width, thick lines fuse into one band.' }),
  grain: z.number().min(0).max(1).default(DEFAULTS.grain)
    .meta({ section: 'The hand', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Grain',
            help: 'Roughness of the rice-flour stroke itself. Low is a smooth continuous '
                + 'line; high breaks it into stippled, powder-like flecks.' }),
  penSpeed: z.number().min(0.2).max(5).default(DEFAULTS.penSpeed)
    .meta({ section: 'The hand', ui: 'slider', min: 0.2, max: 5, step: 0.1, label: 'Pen speed',
            help: 'How fast the pen draws the composition, as a multiple of the base pace. '
                + 'Applies live — the finished drawing never changes shape, only how '
                + 'quickly it appears.' }),
  handWobble: z.number().min(0).max(1).default(DEFAULTS.handWobble)
    .meta({ section: 'The hand', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Hand wobble',
            help: 'Unsteadiness in the hand tracing each stroke. 0 is machine-straight; '
                + 'higher wanders like an unpractised hand.' }),
  holdSeconds: z.number().min(2).max(30).default(DEFAULTS.holdSeconds)
    .meta({ section: 'The hand', ui: 'slider', min: 2, max: 30, step: 1, label: 'Hold',
            help: 'Seconds the finished kolam rests fully drawn before it is erased and a '
                + 'fresh one begins. Applies live.' }),

  // ── Color ──
  background: z.string().regex(HEX6).default(DEFAULTS.background)
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'Ground the kolam is drawn on. Its lightness and warmth drive the whole '
                + 'ground wash — see Ground grain below. Applies live.' }),
  groundGrain: z.number().int().min(0).max(60).default(DEFAULTS.groundGrain)
    .meta({ section: 'Color', ui: 'slider', min: 0, max: 60, step: 1, label: 'Ground grain',
            help: 'Amplitude of the ground’s fine noise texture — a raw 0–255 '
                + 'tonal amplitude, not a 0–1 fraction. Higher reads as a rougher, more '
                + 'swept-concrete surface.' }),
  palette: z.array(z.string().regex(HEX6)).min(3).max(12).default(DEFAULTS.palette)
    .meta({ section: 'Color', ui: 'colorList', min: 3, max: 12, label: 'Palette',
            help: 'The master set of chalk colours available to the drawing. Each drawing '
                + 'samples only 2–3 of these per run, so most kolams show a subset, '
                + 'never the whole list at once.' }),
  kaaviColor: z.string().regex(HEX6).default(DEFAULTS.kaaviColor)
    .meta({ section: 'Color', ui: 'color', label: 'Kaavi color',
            help: 'Colour of the kaavi border markings framing the composition.' }),
  kaavi: z.boolean().default(DEFAULTS.kaavi)
    .meta({ section: 'Color', ui: 'toggle', label: 'Kaavi',
            help: 'Draws the bordering kaavi lines that frame the composition. Off leaves '
                + 'just the kolam figure on its ground.' }),
  colouredChalk: z.number().min(0).max(1).default(DEFAULTS.colouredChalk)
    .meta({ section: 'Color', ui: 'slider', min: 0, max: 1, step: 0.05, label: 'Coloured chalk',
            help: 'Chance a stroke is drawn in a coloured chalk instead of white rice-flour '
                + 'powder. 0 is an all-white traditional kolam; 1 colours nearly every stroke.' }),

  // ── Seed (pin-only) ──
  seed: z.number().int().default(1)
    .meta({ section: 'Advanced', collapsed: true, ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. Sets the whole drawing — its motifs, registers and '
                + 'colours. A shared link is seedless, so every visit draws a different one.' }),
})

export type KolamSchemaConfig = z.infer<typeof kolamSchema>
