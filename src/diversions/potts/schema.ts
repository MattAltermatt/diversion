import { z } from 'zod'

// Potts grain growth. Every cell holds one of Q "orientations" (colours). The energy
// of the lattice is the number of unlike-neighbour pairs — every grain boundary costs
// energy. A Monte-Carlo move picks a cell, proposes adopting a random neighbour's
// orientation, and accepts it when that lowers the boundary energy (or, at a small
// temperature, sometimes when it doesn't). Because a new orientation can only ever be
// borrowed from a neighbour, no new grains nucleate — existing grains only grow or
// shrink. Curvature-driven boundary migration makes big grains swallow small ones and
// the polycrystal COARSENS: a mosaic of colour cells whose walls glide and straighten
// forever, exactly like annealing metal.
export const pottsSchema = z.object({
  // ── Field ──
  cellSize: z.number().int().min(2).max(16).default(4)
    .meta({ section: 'Field', ui: 'slider', min: 2, max: 16, step: 1, label: 'Cell size',
            help: 'Pixel size of each cell. Small = a fine mosaic of many tiny grains; large = '
                + 'bold, chunky crystal blocks.' }),

  // ── Rules ──
  states: z.number().int().min(4).max(40).default(20)
    .meta({ section: 'Rules', ui: 'slider', min: 4, max: 40, step: 1, label: 'Orientations',
            help: 'How many distinct grain orientations (colors) exist. More = a richer stained-'
                + 'glass mosaic with more grains before neighbours share a color and merge.' }),
  temperature: z.number().min(0).max(2).default(0.4)
    .meta({ section: 'Rules', ui: 'slider', min: 0, max: 2, step: 0.05, label: 'Temperature',
            help: '0 = strict energy descent: boundaries stay crisp and clean. A small value adds '
                + 'thermal wiggle — fuzzier, livelier boundaries that never pin. High melts the grains.' }),
  stepsPerFrame: z.number().int().min(1).max(8).default(2)
    .meta({ section: 'Rules', ui: 'slider', min: 1, max: 8, step: 1, label: 'Speed',
            help: 'Monte-Carlo sweeps of the whole lattice per frame. Higher coarsens faster; lower '
                + 'is a calmer, more watchable anneal.' }),

  // ── Color ──
  boundary: z.boolean().default(true)
    .meta({ section: 'Color', ui: 'toggle', label: 'Grain boundaries',
            help: 'Trace a dark line along every grain wall — the leading between the panes that '
                + 'gives the metallurgical / stained-glass look.' }),
  boundaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#080810')
    .meta({ section: 'Color', ui: 'color', label: 'Wall color',
            help: 'Color of the grain-boundary outline (used only when Grain boundaries is on).' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#05060a')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'The ground color behind the lattice (shows at the grid-edge margin).' }),
  palette: z.object({
    hueStart: z.number().min(0).max(360).default(0)
      .meta({ ui: 'slider', min: 0, max: 360, step: 1, label: 'Hue start',
              help: 'Where the grain-color ring begins on the hue wheel (degrees).' }),
    hueSpan: z.number().min(0).max(360).default(340)
      .meta({ ui: 'slider', min: 0, max: 360, step: 1, label: 'Hue span',
              help: 'How much of the hue wheel the grain colors cover. 360 = full rainbow; narrow = '
                  + 'a tight, moody range of related tones.' }),
    saturation: z.number().min(0).max(100).default(62)
      .meta({ ui: 'slider', min: 0, max: 100, step: 1, label: 'Saturation',
              help: 'Color intensity of the grains. 0 = greyscale.' }),
    lightness: z.number().min(0).max(100).default(55)
      .meta({ ui: 'slider', min: 0, max: 100, step: 1, label: 'Lightness',
              help: 'How light the grain colors are.' }),
  }).default({ hueStart: 0, hueSpan: 340, saturation: 62, lightness: 55 })
    .meta({ section: 'Color', ui: 'group', label: 'Palette' }),

  // ── Advanced ──
  seed: z.number().int().default(42)
    .meta({ section: 'Advanced', collapsed: true, ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed regenerates the same starting grains and evolution. '
                + 'A shared link is seedless — every visit anneals a fresh polycrystal.' }),
})

export type PottsConfig = z.infer<typeof pottsSchema>
