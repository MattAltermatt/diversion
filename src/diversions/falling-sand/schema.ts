import { z } from 'zod'

export const fallingSandSchema = z.object({
  // ── Simulation ──
  cellSize: z.number().int().min(2).max(8).default(4)
    .meta({ section: 'Simulation', ui: 'slider', min: 2, max: 8, step: 1, label: 'Cell size',
            help: 'Pixel size of each grain. Smaller means a finer, denser powder; larger runs faster and reads chunkier.' }),
  simSpeed: z.number().int().min(10).max(120).default(60)
    .meta({ section: 'Simulation', ui: 'slider', min: 10, max: 120, step: 5, label: 'Sim speed',
            help: 'Physics steps per second — how fast grains fall, water spreads, and fire climbs. Lower is a calmer, more watchable pour.' }),
  // ── Emitters ──
  emitterCount: z.number().int().min(1).max(4).default(2)
    .meta({ section: 'Emitters', ui: 'slider', min: 1, max: 4, step: 1, label: 'Emitters',
            help: 'How many spouts drift across the top of the screen, autonomously pouring material so the chamber never empties.' }),
  emitRate: z.number().int().min(5).max(80).default(24)
    .meta({ section: 'Emitters', ui: 'slider', min: 5, max: 80, step: 1, label: 'Emit rate',
            help: 'Grains poured per second, per emitter.' }),
  elements: z.object({
    emitSand: z.boolean().default(true)
      .meta({ ui: 'toggle', label: 'Sand',
              help: 'Falls and piles at an angle of repose.' }),
    emitWater: z.boolean().default(true)
      .meta({ ui: 'toggle', label: 'Water',
              help: 'Falls, spreads, and finds its level.' }),
    emitFire: z.boolean().default(true)
      .meta({ ui: 'toggle', label: 'Fire',
              help: 'Rises, decays, and ignites nearby plant — extinguished by water.' }),
    emitPlant: z.boolean().default(true)
      .meta({ ui: 'toggle', label: 'Plant',
              help: 'Static and flammable — a fuse for fire to climb and consume.' }),
  }).default({ emitSand: true, emitWater: true, emitFire: true, emitPlant: true })
    .meta({ section: 'Emitters', ui: 'group', label: 'Element mix',
            help: 'Which elements are active. Sand and water pour from the top spouts; '
                + 'plant sprouts as fuses from the settled sand and fire sparks on those '
                + 'plants (they live at the ground, not the ceiling). Disabling one stops '
                + 'new cells of it from appearing.' }),
  // ── Color ──
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#07080c')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'Empty-cell color behind the material.' }),
  colors: z.object({
    sand: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#d9a054')
      .meta({ ui: 'color', label: 'Sand' }),
    water: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#2e78c9')
      .meta({ ui: 'color', label: 'Water' }),
    fire: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ff7a1e')
      .meta({ ui: 'color', label: 'Fire' }),
    stone: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#5a5f66')
      .meta({ ui: 'color', label: 'Stone' }),
    plant: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#3f9e4a')
      .meta({ ui: 'color', label: 'Plant' }),
  }).default({ sand: '#d9a054', water: '#2e78c9', fire: '#ff7a1e', stone: '#5a5f66', plant: '#3f9e4a' })
    .meta({ section: 'Color', ui: 'group', label: 'Elements' }),
  // ── Advanced ──
  seed: z.number().int().default(1)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true, collapsed: true,
            help: 'Any integer. The same seed replays the same emitter drift and grain jitter. A shared link is seedless — every visit pours a fresh chamber.' }),
})

export type FallingSandConfig = z.infer<typeof fallingSandSchema>
