import { z } from 'zod'

export const penroseSchema = z.object({
  // ── Tiling ──
  depth: z.number().int().min(3).max(6).default(5)
    .meta({ section: 'Tiling', ui: 'slider', min: 3, max: 6, step: 1, label: 'Depth',
            help: 'How many times the rhombs subdivide — deeper makes a finer, denser tiling. '
                + 'Capped at 6 to hold 60fps (the whole rotating field is redrawn each frame).' }),
  lineWidth: z.number().min(0).max(4).default(1.2)
    .meta({ section: 'Tiling', ui: 'slider', min: 0, max: 4, step: 0.2, label: 'Edge width',
            help: 'Thickness of the rhombus edges. 0 hides them for pure colour fields.' }),
  seed: z.number().int().default(1)
    .meta({ section: 'Tiling', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Rotates the whole lattice to a fresh orientation. A shared link is seedless — '
                + 'every visit opens on a different view.' }),
  // ── Motion ──
  spin: z.number().min(0).max(1).default(0.1)
    .meta({ section: 'Motion', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Spin',
            help: 'How fast the tiling rotates. 0 = still.' }),
  // ── Color ──
  thick: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#e8a33a')
    .meta({ section: 'Color', ui: 'color', label: 'Wide rhomb',
            help: 'Fill of the fat (72°) rhombs.' }),
  thin: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#7a3b9a')
    .meta({ section: 'Color', ui: 'color', label: 'Narrow rhomb',
            help: 'Fill of the thin (36°) rhombs.' }),
  edge: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0e0a14')
    .meta({ section: 'Color', ui: 'color', label: 'Edge color' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0e0a14')
    .meta({ section: 'Color', ui: 'color', label: 'Background' }),
})

export type PenroseConfig = z.infer<typeof penroseSchema>
