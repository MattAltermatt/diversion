import { z } from 'zod'

// Foam Coarsening — a 2D soap froth modelled as multi-order-parameter Allen–Cahn
// grain growth (the Fan–Chen model): 8 order-parameter fields evolve on the GPU so
// each pixel belongs to whichever field is largest — that's its cell. Interfaces
// move by mean curvature, so small cells shrink and vanish while the survivors grow
// without bound (von Neumann's law emerges, it is not scripted). Smooth float fields
// give anti-aliased, gently curved cell walls meeting at ~120° Plateau junctions —
// the smooth-wall cousin of the integer-label Potts model. One schema drives the
// form, the URL codec, and the Config type. Two preset axes (Foam = cell size /
// pace, Palette = colors) live in presets.ts.

// Default: an iridescent soap-film palette on near-black film walls.
const SOAP_FILM = ['#7fe9ff', '#a99bff', '#ffd28a', '#8affc7']

export const foamSchema = z.object({
  // ── Foam ──
  // ★ hero knob: cellScale sets the interface width (κ) → how big the bubbles read.
  cellScale: z.number().min(0.5).max(4).default(1.5)
    .meta({ section: 'Foam', ui: 'slider', min: 0.5, max: 4, step: 0.05, label: 'Cell scale',
            help: 'How big the bubbles read on screen. Sets the width of the film walls (the '
                + 'κ gradient term): low = a fine, delicate froth of many small cells; high = '
                + 'bold, chunky bubbles with thick walls.' }),
  simSpeed: z.number().min(0.1).max(24).default(2)
    .meta({ section: 'Foam', ui: 'slider', min: 0.1, max: 24, step: 0.1, label: 'Sim speed',
            help: 'How fast the froth coarsens, in sub-steps per frame. Below 1 runs a step every '
                + 'few frames for a slow, meditative drift (0.1 ≈ a step every 10 frames); above 1 '
                + 'runs several steps per frame for faster coarsening.' }),
  seed: z.number().int().default(1)
    .meta({ section: 'Foam', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed always nucleates the same froth. A shared link is '
                + 'seedless — every fresh visit grows a different soap film.' }),

  // ── Walls ──
  wallColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0a0d1a')
    .meta({ section: 'Walls', ui: 'color', label: 'Wall color',
            help: 'Color of the film walls between cells — the thin dark lines that trace every '
                + 'Plateau border. Err toward high contrast against the cell colors.' }),
  wallThickness: z.number().min(0).max(1).default(0.5)
    .meta({ section: 'Walls', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Wall thickness',
            help: 'How wide the film walls draw. Low = hairline borders; high = bold leaded lines '
                + 'like stained glass.' }),
  wallContrast: z.number().min(0).max(1).default(0.85)
    .meta({ section: 'Walls', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Wall contrast',
            help: 'How strongly the walls darken toward the wall color. 0 = walls fade into the '
                + 'cells; 1 = crisp, fully-saturated borders.' }),

  // ── Color ──
  stops: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(2).max(8).default(SOAP_FILM)
    .meta({ section: 'Color', ui: 'colorList', min: 2, max: 8, label: 'Cell colors',
            help: 'The cells are colored from these stops (up to 8 distinct grain colors). An '
                + 'iridescent spread reads like soap film; a few saturated tones read like stained '
                + 'glass. Err toward high contrast.' }),
})

export type FoamConfig = z.infer<typeof foamSchema>
