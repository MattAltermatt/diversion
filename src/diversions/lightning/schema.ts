import { z } from 'zod'

// Lightning by the Dielectric Breakdown Model (Niemeyer–Pietronero–Wiesmann 1984):
// solve Laplace's equation on a grid (the growing bolt held at potential 0, the far
// electrode at 1), then extend the bolt to a neighbouring empty cell chosen with
// probability ∝ (local field)^η. η is the branchiness exponent — the headline knob.
// One schema drives the form, the URL codec, and the Config type. Two preset axes
// (Form = mode + η, Look = colours + glow) live in presets.ts.
export const lightningSchema = z.object({
  // ─── The Discharge ──────────────────────────────────────────────────────────
  mode: z.enum(['cloud-to-ground', 'point-to-point', 'radial']).default('cloud-to-ground')
    .meta({ section: 'The Discharge', ui: 'segmented',
            options: ['cloud-to-ground', 'point-to-point', 'radial'], label: 'Geometry',
            help: 'Where the bolt starts and what it reaches for. cloud-to-ground → a leader '
                + 'crawls from the top to the whole ground plane. point-to-point → it seeks one '
                + 'electrode below. radial → grows outward from a centre point into a Lichtenberg star.' }),
  // ★ hero knob: the branchiness exponent from the DBM.
  eta: z.number().min(0.5).max(5).default(2.5)
    .meta({ section: 'The Discharge', ui: 'slider', min: 0.5, max: 5, step: 0.1, label: 'Branchiness (η)',
            help: 'The dielectric-breakdown exponent. Growth favours the strongest-field tips ∝ fieldᵏ. '
                + 'Low (≈1) = a dense, bushy fern that fills space. High (≈4) = a sparse, jagged, '
                + 'sharply-forked bolt — near the physical limit where the channel goes one-dimensional.' }),
  strikeSpeed: z.number().min(20).max(600).default(160)
    .meta({ section: 'The Discharge', ui: 'slider', min: 20, max: 600, step: 10, label: 'Strike speed',
            help: 'How fast the leader crawls (cells grown per second, frame-rate independent). '
                + 'Low = a slow, hypnotic reach; high = a quick, violent stab.' }),
  afterglow: z.number().min(0.3).max(4).default(1.4)
    .meta({ section: 'The Discharge', ui: 'slider', min: 0.3, max: 4, step: 0.1, label: 'Afterglow',
            help: 'Seconds the completed bolt lingers, fading from a white flash to a dim ember before '
                + 'the next strike. Longer = a more contemplative, slow-storm pace.' }),

  // ─── Render ─────────────────────────────────────────────────────────────────
  boltWidth: z.number().min(0.6).max(4).default(1.4)
    .meta({ section: 'Render', ui: 'slider', min: 0.6, max: 4, step: 0.1, label: 'Bolt width',
            help: 'Thickness of the bright bolt core. Thin = a fine crackle; thick = a fat plasma channel.' }),
  glow: z.number().min(0).max(1).default(0.55)
    .meta({ section: 'Render', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Glow',
            help: 'The soft halo blooming around the bolt. 0 = a crisp hairline; high = a hot, '
                + 'atmospheric electric aura. Costs a little framerate.' }),

  // ─── Color ──────────────────────────────────────────────────────────────────
  coreColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#eaf3ff')
    .meta({ section: 'Color', ui: 'color', label: 'Core',
            help: 'The searing-bright centre of the bolt (usually near-white).' }),
  haloColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#4a7dff')
    .meta({ section: 'Color', ui: 'color', label: 'Halo',
            help: 'The colour of the glow around the bolt — the electric aura.' }),
  emberColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ff7a2a')
    .meta({ section: 'Color', ui: 'color', label: 'Ember',
            help: 'The warm colour the bolt decays toward as it fades after the strike.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#03040a')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'The night sky behind the storm — err dark for maximum bolt contrast.' }),

  seed: z.number().int().default(7)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. Same seed regrows the same sequence of bolts. A fresh visit rolls a new storm.' }),
})

export type LightningConfig = z.infer<typeof lightningSchema>
