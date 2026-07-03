import { z } from 'zod'

// Strategy Ecology — spatial Iterated Prisoner's Dilemma (Nowak & May 1992).
// A toroidal grid of agents, each playing repeated Prisoner's Dilemma with its
// eight neighbours; every round each cell copies the highest-scoring strategy it
// can see (imitation dynamics). Cooperation blooms into coloured blobs, defectors
// invade as advancing fronts, and — once memory strategies (TFT / WSLS) are in the
// mix — cooperation collapses and re-emerges in endless cyclical turnover. The
// mechanic is payoff-driven imitation, not a fixed neighbour-count CA rule.
// The grid is a fixed square rendered stretched-to-fill, so a resize never restarts.

export const strategyEcologySchema = z.object({
  gridResolution: z.number().int().min(40).max(160).default(104)
    .meta({ section: 'World', ui: 'slider', min: 40, max: 160, step: 8, label: 'Grid resolution',
            help: 'Cells per side of the square world. Higher = finer fronts, more agents playing.' }),
  seedPattern: z.enum(['random', 'single-defector', 'patches']).default('random')
    .meta({ section: 'World', ui: 'segmented', options: ['random', 'single-defector', 'patches'], label: 'Start from',
            help: 'random: a well-mixed soup that churns forever. single-defector: one defector in a '
                + 'sea of cooperators — grows the famous evolving fractal. patches: a few big blobs.' }),

  strategySet: z.enum(['C / D', 'C / D / TFT / WSLS']).default('C / D / TFT / WSLS')
    .meta({ section: 'Game', ui: 'segmented', options: ['C / D', 'C / D / TFT / WSLS'], label: 'Strategies',
            help: 'C/D: the classic two-strategy Nowak–May (cooperate vs defect). '
                + '+TFT/WSLS: adds memory strategies (Tit-for-Tat, Win-Stay-Lose-Shift) for richer, '
                + 'cyclical dominance — cooperation repeatedly falls and comes back.' }),
  temptation: z.number().min(1.01).max(2).default(1.82)
    .meta({ section: 'Game', ui: 'slider', min: 1.01, max: 2, step: 0.01, label: 'Temptation (b)',
            help: 'Payoff for defecting against a cooperator (mutual cooperation = 1, everything else '
                + '= 0). Higher rewards betrayal. The lively, ever-shifting regime lives around 1.7–2.0.' }),
  roundsPerGame: z.number().int().min(2).max(24).default(8)
    .meta({ section: 'Game', ui: 'slider', min: 2, max: 24, step: 1, label: 'Rounds per game',
            help: 'How many rounds each pair plays before scores are tallied. Memory strategies only '
                + 'differ from AllC/AllD once the game is repeated.',
            showWhen: { field: 'strategySet', equals: 'C / D / TFT / WSLS' } }),
  selfPlay: z.boolean().default(true)
    .meta({ section: 'Game', ui: 'toggle', label: 'Play self',
            help: 'On: each cell also plays a game against itself (the canonical Nowak–May rule) — '
                + 'helps cooperators survive by huddling. Off: neighbours only.' }),

  cellColors: z.object({
    cooperate: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#3b82f6')
      .meta({ ui: 'color', label: 'Cooperate (AllC)' }),
    defect: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ff3b57')
      .meta({ ui: 'color', label: 'Defect (AllD)' }),
    tft: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#2dd4a7')
      .meta({ ui: 'color', label: 'Tit-for-Tat' }),
    wsls: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#f5b000')
      .meta({ ui: 'color', label: 'Win-Stay-Lose-Shift' }),
  }).default({ cooperate: '#3b82f6', defect: '#ff3b57', tft: '#2dd4a7', wsls: '#f5b000' })
    .meta({ section: 'Look', ui: 'group', label: 'Strategy colours' }),
  highlightChanges: z.boolean().default(true)
    .meta({ section: 'Look', ui: 'toggle', label: 'Flash invasions',
            help: 'Briefly brighten any cell that just switched strategy, so the invasion fronts '
                + 'read as crisp moving edges.' }),

  simSpeed: z.number().min(1).max(24).default(7)
    .meta({ section: 'Sim', ui: 'slider', min: 1, max: 24, step: 0.5, label: 'Sim speed',
            help: 'Rounds of imitation per second. Lower is calmer.' }),
  showHud: z.boolean().default(true)
    .meta({ section: 'HUD', ui: 'toggle', label: 'Show readout',
            help: 'Overlay the current fraction of each strategy.' }),

  seed: z.number().int().default(3)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed reproduces the same world. A fresh visit rolls a new one.' }),
})

export type StrategyEcologyConfig = z.infer<typeof strategyEcologySchema>
