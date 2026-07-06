import { z } from 'zod'

// Crystal value → color. Index 0 is the empty background; the rest tint the ice
// from thin edges to solid core. Default: deep night → ice blue → white.
const FROST = ['#05070f', '#123a63', '#4fb3e8', '#eafcff']

export const reiterSnowflakeSchema = z.object({
  // ── Crystal ── the Reiter (2005) snow-crystal parameters, named for feel.
  spread: z.number().min(0.6).max(2.4).default(1.0)
    .meta({ section: 'Crystal', ui: 'slider', min: 0.6, max: 2.4, step: 0.05, label: 'Spread',
            help: 'Diffusion rate — how freely water vapor moves. Higher grows broader, more '
                + 'plate-like arms; lower keeps them fine and needle-thin.' }),
  humidity: z.number().min(0.3).max(0.9).default(0.5)
    .meta({ section: 'Crystal', ui: 'slider', min: 0.3, max: 0.9, step: 0.01, label: 'Humidity',
            help: 'Background vapor the air holds. Higher freezes denser, more solid flakes; '
                + 'lower grows sparse, branchy stars. The whole look lives on this knob.' }),
  sharpness: z.number().min(0.0002).max(0.01).default(0.0012)
    .meta({ section: 'Crystal', ui: 'slider', min: 0.0002, max: 0.01, step: 0.0002, label: 'Sharpness',
            help: 'How fast vapor solidifies onto the growing tips — small values sculpt crisp '
                + 'dendrites, larger ones fill toward hexagonal plates.' }),
  // ── Motion ──
  speed: z.number().int().min(1).max(10).default(3)
    .meta({ section: 'Motion', ui: 'slider', min: 1, max: 10, step: 1, label: 'Speed',
            help: 'Growth steps per frame. Lower is a slow, mesmerizing crystallization.' }),
  detail: z.number().int().min(151).max(401).default(261)
    .meta({ section: 'Motion', ui: 'slider', min: 151, max: 401, step: 10, label: 'Detail',
            help: 'Grid resolution — finer reveals more delicate branch structure (costs more).' }),
  hold: z.number().min(0.5).max(15).default(5)
    .meta({ section: 'Motion', ui: 'slider', min: 0.5, max: 15, step: 0.5, label: 'Hold',
            help: 'Seconds to hold the finished crystal before it melts and a new one grows.' }),
  seed: z.number().int().default(1)
    .meta({ section: 'Advanced', collapsed: true, ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Jitters the growth conditions so each crystal is unique. A shared link is '
                + 'seedless — every visit grows a different snowflake.' }),
  // ── Color ──
  stops: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(2).max(6).default(FROST)
    .meta({ section: 'Color', ui: 'colorList', min: 2, max: 6, label: 'Ice colors',
            help: 'The lowest color is the empty background; the crystal tints from thin edges '
                + 'to solid core along the rest.' }),
})

export type ReiterSnowflakeConfig = z.infer<typeof reiterSnowflakeSchema>
