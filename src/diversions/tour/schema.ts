import { z } from 'zod'

// Tour — an evolving Travelling-Salesman loop (GH #181).
// Scatter N cities on the plane, start from a chaotic random closed tour (a loop
// visiting every city once), then continuously IMPROVE it with local search:
// 2-opt (reverse a segment when it shortens the loop — equivalently uncross two
// crossing edges) and Or-opt (relocate a short run of cities). The tangled,
// self-crossing scribble visibly untangles into a smooth, near-optimal, crossing-
// free loop. When no improving move turns up for a while it holds the clean tour,
// then scatters fresh cities and starts again. Cities live in a fixed unit square
// drawn centred/letterboxed, so a resize just repaints — it never restarts.

const HEX = /^#[0-9a-fA-F]{6}$/

export const tourSchema = z.object({
  cityCount: z.number().int().min(10).max(320).default(140)
    .meta({ section: 'World', ui: 'slider', min: 10, max: 320, step: 5, label: 'Cities',
            help: 'How many stops the salesman must visit. More cities = a denser web that takes '
                + 'longer to untangle.' }),
  cityLayout: z.enum(['uniform', 'clustered', 'ring', 'grid']).default('uniform')
    .meta({ section: 'World', ui: 'segmented', options: ['uniform', 'clustered', 'ring', 'grid'],
            label: 'City layout',
            help: 'uniform: scattered at random. clustered: gathered into a few blobs. ring: strewn '
                + 'around a circle. grid: on a jittered lattice. The tour always STARTS shuffled and '
                + 'tangled — the layout only shapes the final loop.' }),

  optimizer: z.enum(['2-opt', 'or-opt', 'mixed']).default('mixed')
    .meta({ section: 'Solve', ui: 'segmented', options: ['2-opt', 'or-opt', 'mixed'], label: 'Moves',
            help: '2-opt: reverse a segment to uncross two edges (the classic untangler). or-opt: lift '
                + 'a short run of cities and drop it somewhere better. mixed: both.' }),
  movesPerFrame: z.number().int().min(50).max(4000).default(900)
    .meta({ section: 'Solve', ui: 'slider', min: 50, max: 4000, step: 50, label: 'Solve speed',
            help: 'Candidate moves tried per frame. Higher untangles faster; lower is a slower, more '
                + 'meditative straightening.' }),
  holdSeconds: z.number().min(0).max(12).default(3.5)
    .meta({ section: 'Solve', ui: 'slider', min: 0, max: 12, step: 0.5, label: 'Hold clean tour',
            help: 'Seconds to admire the finished, crossing-free loop before fresh cities scatter and '
                + 'it begins again.' }),

  pathColor: z.object({
    mode: z.enum(['position', 'solid']).default('position')
      .meta({ ui: 'segmented', options: ['position', 'solid'], label: 'Color mode',
              help: 'position: a rainbow swept along the loop, so you can trace the route. solid: one '
                  + 'color for the whole path.' }),
    color: z.string().regex(HEX).default('#7dd3fc')
      .meta({ ui: 'color', label: 'Path color',
              showWhen: { field: 'mode', equals: 'solid' } }),
    glow: z.boolean().default(true)
      .meta({ ui: 'toggle', label: 'Glow',
              help: 'A soft halo under the path so it reads as glowing line-work on the dark ground.' }),
  }).default({ mode: 'position', color: '#7dd3fc', glow: true })
    .meta({ section: 'Look', ui: 'group', label: 'Path' }),
  flashImprovements: z.boolean().default(true)
    .meta({ section: 'Look', ui: 'toggle', label: 'Flash improvements',
            help: 'Briefly brighten each edge the moment a move rewires it, so you can see the loop '
                + 'working itself loose.' }),
  nodeSize: z.number().min(0).max(6).default(2.2)
    .meta({ section: 'Look', ui: 'slider', min: 0, max: 6, step: 0.2, label: 'City dot size',
            help: 'Radius of the city dots, in pixels. 0 hides them and leaves just the loop.' }),
  background: z.string().regex(HEX).default('#05070d')
    .meta({ section: 'Look', ui: 'color', label: 'Background' }),

  seed: z.number().int().default(7)
    .meta({ section: 'Advanced', collapsed: true, ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed reproduces the same cities and the same untangling. A '
                + 'fresh visit rolls a new one.' }),
})

export type TourConfig = z.infer<typeof tourSchema>
