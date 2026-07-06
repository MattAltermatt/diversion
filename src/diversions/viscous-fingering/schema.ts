import { z } from 'zod'

// Viscous Fingering — the Saffman–Taylor / Hele-Shaw instability. A less-viscous
// fluid injected into a more-viscous one cannot advance as a smooth front: any
// bump that pushes ahead feels a steeper pressure gradient and races further
// ahead (positive feedback), tempered by surface tension that smooths the tip and
// sets the finger width. The result is a fractal, branching, tip-splitting
// interface. Modelled here as a reaction-diffusion field (a known RD analog of
// viscous fingering) driven by a continuous CENTRAL injection source, so the
// structure grows OUTWARD from an injection point like ink forced through
// glycerin. One schema drives the form, the URL codec, and the Config type. Two
// preset axes (Fingering = interface character, Color = palette) live in presets.ts.

// Default palette: ink-in-glycerin — near-black glass → deep teal → bright cyan.
const GLACIER_INK = ['#050a14', '#0a4f7a', '#5fd0ff']

export const viscousFingeringSchema = z.object({
  // ─── Fingering ──────────────────────────────────────────────────────────────
  // ★ hero knob: viscosity ratio sets how thin & branching the fingers read.
  viscosityRatio: z.number().min(0).max(1).default(0.55)
    .meta({ section: 'Fingering', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Viscosity ratio',
            help: 'How much thinner the invading fluid is than the fluid it displaces. Higher = '
                + 'thinner, more finely-branching fingers that tip-split often; lower = broader, '
                + 'more lobed fingers.' }),
  surfaceTension: z.number().min(0).max(1).default(0.5)
    .meta({ section: 'Fingering', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Surface tension',
            help: 'Resistance of the interface to sharp curvature — it smooths the tips and sets '
                + 'the finger WIDTH. Higher = wider, smoother, calmer fingers; lower = thin, ragged, '
                + 'restlessly splitting ones.' }),
  injectionRate: z.number().min(0).max(1).default(0.85)
    .meta({ section: 'Fingering', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Injection',
            help: 'How hard invading fluid is forced in at the centre. Higher = a stronger source '
                + 'that pushes the fingers outward faster and more insistently.' }),
  noise: z.number().min(0).max(1).default(0.25)
    .meta({ section: 'Fingering', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Perturbation',
            help: 'Micro-roughness on the advancing front. It seeds the instability so a smooth '
                + 'expanding ring breaks into branching fingers and keeps tip-splitting. 0 = the '
                + 'front stays smoother; higher = wilder, more chaotic branching.' }),
  simSpeed: z.number().min(0.1).max(24).default(8)
    .meta({ section: 'Fingering', ui: 'slider', min: 0.1, max: 24, step: 0.1, label: 'Sim speed',
            help: 'How fast the fluid advances, in sub-steps per frame. Below 1 runs a step every '
                + 'few frames for a slow, meditative spread; above 1 runs several steps per frame '
                + 'for faster growth.' }),
  seed: z.number().int().default(1)
    .meta({ section: 'Advanced', collapsed: true, ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed always grows the same fingers. A shared link is '
                + 'seedless — every fresh visit grows a different pattern.' }),

  // ─── Color ──────────────────────────────────────────────────────────────────
  colorMode: z.enum(['concentration', 'arrival']).default('concentration')
    .meta({ section: 'Color', ui: 'segmented', options: ['concentration', 'arrival'], label: 'Color by',
            help: 'concentration → color by how dense the invading fluid is (bright channels, dark '
                + 'gaps). arrival → color by WHEN each spot was invaded, so the advancing tips glow '
                + 'and the older channels behind them fall back — fingers read as radiating fronts.' }),
  palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(2).max(8).default(GLACIER_INK)
    .meta({ section: 'Color', ui: 'colorList', min: 2, max: 8, label: 'Finger colors',
            help: 'The invading fluid is colored along these stops — the lowest is the faintest '
                + 'wisp, the highest is the dense finger core. Err toward high contrast.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#050a14')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'The un-invaded, more-viscous fluid — the empty space the fingers grow into.' }),
})

export type ViscousFingeringConfig = z.infer<typeof viscousFingeringSchema>
