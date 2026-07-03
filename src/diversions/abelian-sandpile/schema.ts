import { z } from 'zod'

// Grain-count → color ramp. Counts run 0..3 at rest; index 0 is empty background,
// index 1 is the brightest 3-grain cell. Default: indigo → violet → magenta → gold.
const AURORA = ['#0b0a1e', '#4b2ea6', '#e0499a', '#ffd36e']

export const abelianSandpileSchema = z.object({
  // ── Growth ──
  speed: z.number().int().min(1).max(40).default(8)
    .meta({ section: 'Growth', ui: 'slider', min: 1, max: 40, step: 1, label: 'Growth speed',
            help: 'How fast the toppling cascade spreads and crystallizes the mandala. Higher '
                + 'finishes sooner; lower is a slow, mesmerizing bloom.' }),
  sources: z.number().int().min(1).max(6).default(1)
    .meta({ section: 'Growth', ui: 'slider', min: 1, max: 6, step: 1, label: 'Sources',
            help: 'How many points the grains rain onto. One makes the iconic perfectly '
                + 'symmetric centered mandala; more make interacting piles that collide.' }),
  detail: z.number().int().min(251).max(901).default(601)
    .meta({ section: 'Growth', ui: 'slider', min: 251, max: 901, step: 50, label: 'Detail',
            help: 'Grid resolution. Higher reveals finer self-similar fractal structure but '
                + 'costs more to topple.' }),
  hold: z.number().min(0.5).max(20).default(6)
    .meta({ section: 'Growth', ui: 'slider', min: 0.5, max: 20, step: 0.5, label: 'Hold',
            help: 'Seconds to hold the finished mandala once it crystallizes, before it clears '
                + 'and regrows.' }),
  seed: z.number().int().default(1)
    .meta({ section: 'Growth', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. Sets where extra sources land (a single centered source is the '
                + 'same every time). A shared link is seedless — each visit reseeds.' }),
  // ── Color ──
  stops: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(2).max(8).default(AURORA)
    .meta({ section: 'Color', ui: 'colorList', min: 2, max: 8, label: 'Grain colors',
            help: 'Grain counts 0–3 map along these colors: the lowest is empty background, the '
                + 'highest is the densest (3-grain) cells. Four colors give the classic look.' }),
})

export type AbelianSandpileConfig = z.infer<typeof abelianSandpileSchema>
