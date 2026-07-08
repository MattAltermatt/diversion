import { z } from 'zod'

// Young → old age ramp: a soft "cumulus" ramp — pale icy young cells maturing
// into deep indigo storm-blues as they approach the overpopulation threshold.
const CIRRUS = ['#eef7ff', '#a9d4f5', '#6f96d8', '#3c4a8f']

export const cloudlifeSchema = z.object({
  // ── Rule ──
  maxAge: z.number().int().min(8).max(200).default(64)
    .meta({ section: 'Rule', ui: 'slider', min: 8, max: 200, step: 1, label: 'Max age',
            help: 'Once a live cell survives past this many generations it starts counting as 3 '
                + 'toward its neighbours’ head-counts instead of 1 — enough on its own to push a '
                + 'neighbouring cell into birth, or push itself into overpopulation. Long-lived clumps '
                + 'explode instead of freezing into still lifes, which is what keeps the field '
                + 'billowing forever instead of settling.' }),
  initialDensity: z.number().min(0.05).max(0.6).default(0.42)
    .meta({ section: 'Rule', ui: 'slider', min: 0.05, max: 0.6, step: 0.01, label: 'Initial density',
            help: 'Fraction of cells alive when the board is (re)seeded from noise.' }),
  // ── Motion ──
  speed: z.number().int().min(1).max(60).default(22)
    .meta({ section: 'Motion', ui: 'slider', min: 1, max: 60, step: 1, label: 'Speed',
            help: 'Generations per second. Lower is a calm, slow-billowing drift; higher churns fast.' }),
  cellSize: z.number().int().min(2).max(10).default(6)
    .meta({ section: 'Motion', ui: 'slider', min: 2, max: 10, step: 1, label: 'Cell size',
            help: 'Size of each cell in pixels. Small cells read as soft cloud texture; large cells '
                + 'read as blocky pixels.' }),
  // ── Color ──
  palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(2).max(8).default(CIRRUS)
    .meta({ section: 'Color', ui: 'colorList', min: 2, max: 8, label: 'Palette',
            help: 'The age ramp a live cell is tinted along as it survives — youngest at the bottom, '
                + 'oldest (closest to exploding) at the top.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#05070d')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'The colour of empty (dead) cells.' }),
  // ── Advanced ──
  seed: z.number().int().default(1)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true, collapsed: true,
            help: 'Any integer. The same seed replays the same starting board. A shared link is '
                + 'seedless — every fresh visit seeds a new cloud.' }),
})

export type CloudLifeConfig = z.infer<typeof cloudlifeSchema>
