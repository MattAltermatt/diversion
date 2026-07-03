import { z } from 'zod'

export const truchetFlowSchema = z.object({
  // ── Tiling ──
  tileSize: z.number().int().min(28).max(140).default(60)
    .meta({ section: 'Tiling', ui: 'slider', min: 28, max: 140, step: 4, label: 'Tile size',
            help: 'Size of each tile in pixels — smaller packs a denser, more intricate weave; '
                + 'larger reads as bold, sweeping loops.' }),
  lineWidth: z.number().int().min(1).max(20).default(6)
    .meta({ section: 'Tiling', ui: 'slider', min: 1, max: 20, step: 1, label: 'Line width',
            help: 'Thickness of the curves.' }),
  seed: z.number().int().default(1)
    .meta({ section: 'Tiling', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. Chooses each tile’s orientation. A shared link is seedless — '
                + 'every visit weaves a different maze.' }),
  // ── Flow ──
  flowSpeed: z.number().min(0).max(2).default(0.6)
    .meta({ section: 'Flow', ui: 'slider', min: 0, max: 2, step: 0.02, label: 'Flow speed',
            help: 'How fast the bright current streams along the curves, like charge through '
                + 'circuitry. 0 = still traces.' }),
  glow: z.number().min(0).max(1).default(0.5)
    .meta({ section: 'Flow', ui: 'slider', min: 0, max: 1, step: 0.02, label: 'Current density',
            help: 'How much of each curve the flowing pulses cover — low is sparse sparks, high '
                + 'is a near-solid glowing stream.' }),
  // ── Color ──
  trace: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#123a2a')
    .meta({ section: 'Color', ui: 'color', label: 'Trace', help: 'The dim base curves.' }),
  flow: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#4dffa0')
    .meta({ section: 'Color', ui: 'color', label: 'Current', help: 'The bright flowing pulses.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#060a08')
    .meta({ section: 'Color', ui: 'color', label: 'Background' }),
})

export type TruchetFlowConfig = z.infer<typeof truchetFlowSchema>
