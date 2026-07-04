import { z } from 'zod'

// Schelling's Segregation Model (GH #178). A grid of two or three agent types plus
// empty cells. An agent is "happy" when at least a fraction `tolerance` of its
// occupied 8-neighbours share its type; unhappy agents relocate to an empty cell.
// The striking result — even a MILD same-type preference drives the whole grid to
// sort itself into large single-type neighbourhoods that no individual intended.
// The sim runs on a fixed square grid rendered stretched-to-fill, so resizing never
// restarts the world.

export const schellingSchema = z.object({
  gridSize: z.number().int().min(20).max(160).default(80)
    .meta({ section: 'World', ui: 'slider', min: 20, max: 160, step: 4, label: 'Grid size',
            help: 'Cells per side of the square grid. Higher = finer salt-and-pepper and smaller blocks.' }),
  emptyFraction: z.number().min(0.02).max(0.4).default(0.1)
    .meta({ section: 'World', ui: 'slider', min: 0.02, max: 0.4, step: 0.01, label: 'Empty space',
            help: 'Fraction of cells left vacant. Empties are the room agents move into — too few '
                + 'and the grid gridlocks; a little slack lets it sort.' }),

  types: z.number().int().min(2).max(3).default(2)
    .meta({ section: 'Rules', ui: 'slider', min: 2, max: 3, step: 1, label: 'Types',
            help: 'How many agent types share the grid (2 or 3). More types = more borders to negotiate.' }),
  tolerance: z.number().min(0).max(0.9).default(0.35)
    .meta({ section: 'Rules', ui: 'slider', min: 0, max: 0.9, step: 0.05, label: 'Same-type preference',
            help: 'The headline knob. The minimum fraction of an agent’s occupied neighbours that must '
                + 'match its type for it to stay put. Try it LOW (0.30–0.40): wanting barely a third of '
                + 'your neighbours the same still crystallises the whole grid into segregated blocks — '
                + 'segregation nobody intended. Above ~0.7 nobody is ever happy and it churns forever.' }),
  moveMode: z.enum(['random', 'nearest']).default('random')
    .meta({ section: 'Rules', ui: 'segmented', options: ['random', 'nearest'], label: 'Move to',
            help: 'random: an unhappy agent jumps to any empty cell (fast global mixing). '
                + 'nearest: it shuffles to the closest empty cell (blocks grow more locally, like-with-like).' }),

  speed: z.number().min(1).max(30).default(8)
    .meta({ section: 'Motion', ui: 'slider', min: 1, max: 30, step: 1, label: 'Speed',
            help: 'Sorting rounds per second. Low and slow is the zen default — watch the blocks bloom.' }),
  holdSeconds: z.number().min(0).max(12).default(4)
    .meta({ section: 'Motion', ui: 'slider', min: 0, max: 12, step: 0.5, label: 'Hold when settled',
            help: 'Once almost everyone is happy the pattern holds this long, then the grid is reshuffled '
                + 'back to salt-and-pepper and sorts again — an endless calm loop.' }),

  palette: z.object({
    background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0b0d12')
      .meta({ ui: 'color', label: 'Empty / background' }),
    typeA: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ff4d6d')
      .meta({ ui: 'color', label: 'Type A' }),
    typeB: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#4dd0e1')
      .meta({ ui: 'color', label: 'Type B' }),
    typeC: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ffd166')
      .meta({ ui: 'color', label: 'Type C (3-type only)' }),
  }).default({ background: '#0b0d12', typeA: '#ff4d6d', typeB: '#4dd0e1', typeC: '#ffd166' })
    .meta({ section: 'Look', ui: 'group', label: 'Palette',
            help: 'High contrast between types makes the emerging neighbourhoods pop.' }),

  showHud: z.boolean().default(true)
    .meta({ section: 'HUD', ui: 'toggle', label: 'Show readout',
            help: 'Overlay the live segregation index and unhappy count.' }),

  seed: z.number().int().default(7)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed reproduces the same sorting. A fresh visit rolls a new one.' }),
})

export type SchellingConfig = z.infer<typeof schellingSchema>
