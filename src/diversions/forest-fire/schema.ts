import { z } from 'zod'

export const forestFireSchema = z.object({
  // ── Grid ──
  cellSize: z.number().int().min(2).max(12).default(4)
    .meta({ section: 'Grid', ui: 'slider', min: 2, max: 12, step: 1, label: 'Cell size',
            help: 'Pixel size of each cell — smaller means a finer, denser forest and larger, '
                + 'more sweeping fires.' }),
  initialDensity: z.number().min(0).max(0.9).default(0.4)
    .meta({ section: 'Grid', ui: 'slider', min: 0, max: 0.9, step: 0.01, label: 'Initial forest',
            help: 'Fraction of cells that start as trees. The system self-regulates, so this '
                + 'mainly shapes the first few seconds before criticality takes over.' }),
  // ── Motion ──
  speed: z.number().int().min(1).max(40).default(12)
    .meta({ section: 'Motion', ui: 'slider', min: 1, max: 40, step: 1, label: 'Speed',
            help: 'Simulation steps per second. Fire spreads one cell-ring per step, so lower is '
                + 'a calm, watchable burn.' }),
  // ── Fire ──
  growth: z.number().min(0.002).max(0.1).default(0.02)
    .meta({ section: 'Fire', ui: 'slider', min: 0.002, max: 0.1, step: 0.001, label: 'Growth (p)',
            help: 'Chance each step an empty cell sprouts a new tree. Higher regrows the forest '
                + 'faster between fires.' }),
  lightning: z.number().min(0).max(0.001).default(0.00002)
    .meta({ section: 'Fire', ui: 'slider', min: 0, max: 0.001, step: 0.00001, label: 'Lightning (f)',
            help: 'Chance each step a lone tree spontaneously ignites. Tiny — with growth far '
                + 'greater than lightning the forest self-organizes to criticality, so fires of '
                + 'every size sweep through, forever.' }),
  emberLife: z.number().int().min(0).max(20).default(6)
    .meta({ section: 'Fire', ui: 'slider', min: 0, max: 20, step: 1, label: 'Ember afterglow',
            help: 'How many steps burnt ground glows as fading embers before going dark. A brief '
                + 'afterglow reads far better than instant black.' }),
  // ── Color ──
  ground: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#140f08')
    .meta({ section: 'Color', ui: 'color', label: 'Ground',
            help: 'Color of bare, burnt earth.' }),
  tree: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#2f9e3f')
    .meta({ section: 'Color', ui: 'color', label: 'Forest',
            help: 'Color of mature trees; young growth is a darker shade of this green.' }),
  fire: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ff5a1e')
    .meta({ section: 'Color', ui: 'color', label: 'Fire',
            help: 'Color of the burning front and the embers it leaves behind.' }),
  // ── Advanced ──
  seed: z.number().int().default(1)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true, collapsed: true,
            help: 'Any integer. The same seed replays the same forest. A shared link is seedless — '
                + 'every visit grows a fresh one.' }),
})

export type ForestFireConfig = z.infer<typeof forestFireSchema>
