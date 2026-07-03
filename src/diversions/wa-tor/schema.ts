import { z } from 'zod'

// Wa-Tor — A. K. Dewdney's predator-prey ecosystem (Scientific American, Dec 1984).
// A toroidal grid of cells, each EMPTY, a FISH, or a SHARK. Every chronon (step)
// each creature acts once, in a random order: a fish darts to a random empty
// neighbor and breeds behind it once its timer matures; a shark eats an adjacent
// fish if one exists (else moves to a random empty neighbor), pays an upkeep cost
// each step, starves once its energy runs out, and breeds behind it the same way.
// From simple local rules alone you get rolling Lotka–Volterra population waves:
// fish bloom, a shark front arrives and culls them, sharks then starve back down,
// and fish recover — forever. The grid is a fixed square rendered stretched-to-fill,
// so a resize never restarts the world.

export const waTorSchema = z.object({
  gridResolution: z.number().int().min(60).max(220).default(120)
    .meta({ section: 'World', ui: 'slider', min: 60, max: 220, step: 4, label: 'Grid resolution',
            help: 'Cells per side of the square ocean. Higher = finer waves, more creatures.' }),
  initialFish: z.number().min(0.05).max(0.9).default(0.4)
    .meta({ section: 'World', ui: 'slider', min: 0.05, max: 0.9, step: 0.05, label: 'Initial fish',
            help: 'Fraction of cells seeded with a fish at the start.' }),
  initialSharks: z.number().min(0.005).max(0.3).default(0.05)
    .meta({ section: 'World', ui: 'slider', min: 0.005, max: 0.3, step: 0.005, label: 'Initial sharks',
            help: 'Fraction of cells seeded with a shark at the start. Kept scarce so fish bloom first.' }),

  fishBreedTime: z.number().int().min(2).max(30).default(8)
    .meta({ section: 'Rules', ui: 'slider', min: 2, max: 30, step: 1, label: 'Fish breed time',
            help: 'Chronons a fish must survive (and successfully move) before it leaves a new fish '
                + 'behind. Lower = faster fish blooms.' }),
  sharkBreedTime: z.number().int().min(4).max(50).default(14)
    .meta({ section: 'Rules', ui: 'slider', min: 4, max: 50, step: 1, label: 'Shark breed time',
            help: 'Chronons a shark must survive (and successfully move) before it leaves a new shark '
                + 'behind. Keep this well above fish breed time so fish can recover between culls.' }),
  sharkStartEnergy: z.number().int().min(2).max(40).default(10)
    .meta({ section: 'Rules', ui: 'slider', min: 2, max: 40, step: 1, label: 'Shark starting energy',
            help: 'Energy a shark starts (and a newborn shark starts) with. A shark loses 1 energy '
                + 'per chronon and dies at 0 — this is how long it can go without eating.' }),
  fishEnergy: z.number().int().min(1).max(30).default(6)
    .meta({ section: 'Rules', ui: 'slider', min: 1, max: 30, step: 1, label: 'Energy per fish eaten',
            help: 'Energy a shark gains from eating a fish. Higher = sharks thrive on fewer meals.' }),

  palette: z.object({
    background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#050b16')
      .meta({ ui: 'color', label: 'Water' }),
    fish: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#f2c14e')
      .meta({ ui: 'color', label: 'Fish' }),
    shark: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ff3b57')
      .meta({ ui: 'color', label: 'Shark' }),
  }).default({ background: '#050b16', fish: '#f2c14e', shark: '#ff3b57' })
    .meta({ section: 'Look', ui: 'group', label: 'Palette' }),

  simSpeed: z.number().min(1).max(30).default(8)
    .meta({ section: 'Sim', ui: 'slider', min: 1, max: 30, step: 0.5, label: 'Sim speed',
            help: 'Chronons per second. Lower is calmer.' }),

  showHud: z.boolean().default(true)
    .meta({ section: 'HUD', ui: 'toggle', label: 'Show readout',
            help: 'Overlay live fish and shark counts.' }),

  seed: z.number().int().default(17)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed reproduces the same world. A fresh visit rolls a new one.' }),
})

export type WaTorConfig = z.infer<typeof waTorSchema>
