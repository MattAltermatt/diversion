import { z } from 'zod'

/** The binary drive sequences (A/B) that give each Lyapunov fractal its signature.
 *  A → parameter `a`, B → parameter `b`; the logistic rate alternates between them
 *  in this order every iteration. Each sequence yields a completely different
 *  organic form. Kept ≤ 32 long (the shader's uniform array bound). The single
 *  source of truth for the `sequence` enum, the segmented options, and the tests. */
export const SEQUENCES = [
  'BBBBBBAAAAAA', // the classic Markus "Zircon Zity"
  'AB',
  'AABAB',
  'BBABA',
  'AAAAAB',
  'ABBABA',
  'AABB',
] as const

export const lyapunovSchema = z.object({
  // ── Pattern ──
  sequence: z.enum(SEQUENCES).default('BBBBBBAAAAAA')
    .meta({ section: 'Pattern', ui: 'segmented', options: [...SEQUENCES], label: 'Sequence',
            help: 'The A/B drive pattern the logistic rate alternates through — the fractal’s '
                + 'signature. Each one is a totally different organic form.' }),
  speed: z.number().min(0).max(1.5).default(0.15)
    .meta({ section: 'Pattern', ui: 'slider', min: 0, max: 1.5, step: 0.01, label: 'Drift speed',
            help: 'How fast the window slowly pans across parameter space and the palette '
                + 'shimmers. 0 = frozen on one framing.' }),
  zoom: z.number().min(0.15).max(0.9).default(0.55)
    .meta({ section: 'Pattern', ui: 'slider', min: 0.15, max: 0.9, step: 0.01, label: 'View',
            help: 'Half-width of the parameter window. Lower zooms into the filigree of the '
                + 'city ridges; higher pulls back to the whole structure.' }),
  iterations: z.number().int().min(60).max(400).default(220)
    .meta({ section: 'Pattern', ui: 'slider', min: 60, max: 400, step: 20, label: 'Detail',
            help: 'Logistic-map iterations per pixel — more sharpens the ridges and the fine '
                + 'lacework between city and void, at some cost.' }),
  depth: z.number().min(0.2).max(2).default(0.8)
    .meta({ section: 'Pattern', ui: 'slider', min: 0.2, max: 2, step: 0.05, label: 'City depth',
            help: 'Contrast of the warm ramp inside the stable "cities" (how quickly deep '
                + 'stability darkens away from the glowing edge).' }),
  seed: z.number().int().default(1)
    .meta({ section: 'Pattern', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Sets where the window opens in parameter space and its drift path — each '
                + 'fresh visit frames a different swirl. A shared link is seedless; an explicit '
                + 'seed reproduces one framing.' }),
  // ── Color ──
  colorCycle: z.number().min(0).max(1).default(0.2)
    .meta({ section: 'Color', ui: 'slider', min: 0, max: 1, step: 0.02, label: 'Shimmer',
            help: 'How much the warm city palette breathes over time. 0 = static color.' }),
  chaosColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#060312')
    .meta({ section: 'Color', ui: 'color', label: 'Chaos void',
            help: 'Color of the chaotic regions (positive Lyapunov exponent) — the deep voids.' }),
  cityEdge: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ffd27a')
    .meta({ section: 'Color', ui: 'color', label: 'City edge',
            help: 'The glowing ridge where stability begins (exponent just below zero).' }),
  cityDeep: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#5a120a')
    .meta({ section: 'Color', ui: 'color', label: 'City deep',
            help: 'Color deep inside the stable cities (strongly negative exponent).' }),
})

export type LyapunovConfig = z.infer<typeof lyapunovSchema>
