import { z } from 'zod'

export const mazeSchema = z.object({
  cellSize: z.number().int().min(12).max(48).default(22)
    .meta({ section: 'Maze', ui: 'slider', min: 12, max: 48, step: 2, label: 'Cell size',
            help: 'Corridor width in pixels. Small = a dense labyrinth; large = a bold, open maze.' }),
  generator: z.enum(['dfs', 'prim', 'wilson']).default('dfs')
    .meta({ section: 'Maze', ui: 'segmented', options: ['dfs', 'prim', 'wilson'], label: 'Generator',
            help: 'How the maze is carved. dfs = long winding corridors; prim = bushy and even; wilson = unbiased, carves in scattered bursts.' }),
  carveSpeed: z.number().int().min(20).max(500).default(180)
    .meta({ section: 'Motion', ui: 'slider', min: 20, max: 500, step: 10, label: 'Carve speed',
            help: 'Passages opened per second while the maze builds itself. Low and slow is the zen default.' }),
  solveSpeed: z.number().int().min(30).max(800).default(260)
    .meta({ section: 'Motion', ui: 'slider', min: 30, max: 800, step: 10, label: 'Solve speed',
            help: 'Cells revealed per second as the solver searches and the solution glows in.' }),
  solver: z.enum(['flood', 'wall-follower']).default('flood')
    .meta({ section: 'Motion', ui: 'segmented', options: ['flood', 'wall-follower'], label: 'Solver',
            help: 'flood = a wavefront fans out from the entrance, then the shortest path lights up. wall-follower = a single walker hugs the right-hand wall to the exit.' }),
  holdSeconds: z.number().min(0.5).max(8).default(2.5)
    .meta({ section: 'Motion', ui: 'slider', min: 0.5, max: 8, step: 0.5, label: 'Hold',
            help: 'How long the solved maze rests, glowing, before it fades and a fresh one is carved.' }),
  fadeSeconds: z.number().min(0.3).max(4).default(1.2)
    .meta({ section: 'Motion', ui: 'slider', min: 0.3, max: 4, step: 0.1, label: 'Fade',
            help: 'How long the finished maze takes to dissolve before the next one begins.' }),
  wallColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#5b6ea8')
    .meta({ section: 'Color', ui: 'color', label: 'Walls',
            help: 'The maze walls.' }),
  pathColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#35d0e0')
    .meta({ section: 'Color', ui: 'color', label: 'Search',
            help: 'The exploring solver — the flood wavefront or the walker’s trail.' }),
  solvedColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ffd166')
    .meta({ section: 'Color', ui: 'color', label: 'Solution',
            help: 'The final path from entrance to exit, glowing when solved.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0a0e17')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'The ground behind the maze (also the corridor floor).' }),
  seed: z.number().int().default(42)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed carves the same maze. A fresh visit rolls a new one.' }),
})

export type MazeConfig = z.infer<typeof mazeSchema>
