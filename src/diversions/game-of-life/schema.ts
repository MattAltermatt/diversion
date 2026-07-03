import { z } from 'zod'

export const RULES = ['Life', 'HighLife', 'Day/Night', 'Maze', 'Coral'] as const

// Alive-cell age ramp: index 0 is the empty background, then young → old cells.
const EMBER = ['#0a0612', '#ff5a1e', '#ffd36b', '#fffbe8']

export const gameOfLifeSchema = z.object({
  // ── Rule ──
  rule: z.enum(RULES).default('Life')
    .meta({ section: 'Rule', ui: 'segmented', options: RULES as unknown as string[], label: 'Rule',
            help: 'Which birth/survival rule the cells obey. Life is Conway’s classic; HighLife '
                + 'breeds replicators; Day/Night is symmetric; Maze and Coral grow labyrinths.' }),
  density: z.number().min(0.05).max(0.6).default(0.32)
    .meta({ section: 'Rule', ui: 'slider', min: 0.05, max: 0.6, step: 0.01, label: 'Seed density',
            help: 'Fraction of cells alive when the board is (re)seeded from noise.' }),
  // ── Motion ──
  speed: z.number().int().min(1).max(40).default(11)
    .meta({ section: 'Motion', ui: 'slider', min: 1, max: 40, step: 1, label: 'Speed',
            help: 'Generations per second. Lower is a calm, watchable evolution.' }),
  cellSize: z.number().int().min(2).max(14).default(5)
    .meta({ section: 'Motion', ui: 'slider', min: 2, max: 14, step: 1, label: 'Cell size',
            help: 'Size of each cell in pixels — smaller means more, finer cells and larger '
                + 'populations.' }),
  trail: z.number().int().min(0).max(30).default(10)
    .meta({ section: 'Motion', ui: 'slider', min: 0, max: 30, step: 1, label: 'Ghost trail',
            help: 'How many generations a dead cell lingers as a fading ghost. 0 = crisp classic '
                + 'Life; higher leaves soft, cloud-like decay.' }),
  seed: z.number().int().default(1)
    .meta({ section: 'Motion', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed replays the same board. A shared link is seedless — '
                + 'every visit seeds a fresh universe.' }),
  // ── Color ──
  stops: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(2).max(6).default(EMBER)
    .meta({ section: 'Color', ui: 'colorList', min: 2, max: 6, label: 'Cell colors',
            help: 'The lowest color is the empty background; cells are tinted from young to old '
                + 'along the rest as they survive.' }),
})

export type GameOfLifeConfig = z.infer<typeof gameOfLifeSchema>
