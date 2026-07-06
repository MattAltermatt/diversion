// schema.ts — single source of truth (form + URL codec + Config type).
import { z } from 'zod'

export const flockVsHunterSchema = z.object({
  boidCount: z.number().int().min(80).max(400).default(240)
    .meta({ section: 'Ecosystem', ui: 'slider', min: 80, max: 400, step: 10, label: 'Flock size',
            help: 'Boids in the flock. Each carries its own steering genes and breeds into the next generation. 240 stays 60fps and reads as a body.' }),
  predatorCount: z.number().int().min(1).max(8).default(4)
    .meta({ section: 'Ecosystem', ui: 'slider', min: 1, max: 8, step: 1, label: 'Hunters',
            help: 'Predators hunting the flock. A few keeps the pressure legible.' }),
  roundLength: z.number().min(12).max(45).default(22)
    .meta({ section: 'Evolution', ui: 'slider', min: 12, max: 45, step: 1, label: 'Generation length (s)',
            help: 'Seconds each generation runs before both flock and hunters breed. Longer = fairer scoring; shorter = more frequent generational beats.' }),
  flockMutationRate: z.number().min(0).max(1).default(0.12)
    .meta({ section: 'Evolution', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Flock mutation',
            help: 'Chance each flock gene drifts when breeding (a generation-1 peak that cools over the next several). Low = a calm, felt arms race.' }),
  predMutationRate: z.number().min(0).max(1).default(0.15)
    .meta({ section: 'Evolution', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Hunter mutation',
            help: 'Chance each hunter gene drifts. Slightly higher than the flock so the tiny hunter population keeps exploring.' }),
  flockElites: z.number().int().min(0).max(20).default(6)
    .meta({ section: 'Evolution', ui: 'slider', min: 0, max: 20, step: 1, label: 'Flock elites',
            help: 'Fittest boids copied unchanged into the next generation. Keep well below flock size.' }),
  predElites: z.number().int().min(0).max(4).default(1)
    .meta({ section: 'Evolution', ui: 'slider', min: 0, max: 4, step: 1, label: 'Hunter elites',
            help: 'Best hunters carried over verbatim so a good strategy is never lost.' }),
  immigrateEvery: z.number().int().min(0).max(20).default(6)
    .meta({ section: 'Evolution', ui: 'slider', min: 0, max: 20, step: 1, label: 'Fresh blood every (gens)',
            help: 'Every N generations, the weakest few of each population are replaced by brand-new random genes — keeps an all-night run from converging and going static. 0 = off.' }),
  seasons: z.boolean().default(true)
    .meta({ section: 'Evolution', ui: 'toggle', label: 'Seasons',
            help: "Slowly breathe the hunters' top speed up and down over minutes so the advantage keeps trading between hunter and hunted." }),
  trailFade: z.number().min(0).max(0.6).default(0.12)
    .meta({ section: 'Look', ui: 'slider', min: 0, max: 0.6, step: 0.01, label: 'Trail length',
            help: 'How slowly the previous frame fades. Higher = longer, dreamier motion trails. 0 = crisp, no trails.' }),
  flockColors: z.array(z.string().regex(/^#[0-9a-fA-F]{8}$/)).min(1).max(6)
    .default(['#7fd4ffcc', '#a9e7ffcc', '#d8f3ffcc'])
    .meta({ section: 'Look', ui: 'colorList', min: 1, max: 6, label: 'Flock colors',
            help: 'Boids tint by current speed across these. Cool + soft reads as a calm murmuration.' }),
  predatorColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ff3b30')
    .meta({ section: 'Look', ui: 'color', label: 'Hunter color',
            help: 'A bold, high-contrast color so the predators pop against the flock.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#05070d')
    .meta({ section: 'Look', ui: 'color', label: 'Background', help: 'Trails fade toward this color.' }),
  showHud: z.boolean().default(true)
    .meta({ section: 'Look', ui: 'toggle', label: 'Show HUD',
            help: 'Generation counter, survivor %, and the evolving flock + hunter strategy bars.' }),
  speed: z.number().int().min(1).max(4).default(1)
    .meta({ section: 'Motion', ui: 'slider', min: 1, max: 4, step: 1, label: 'Speed',
            help: 'Visual fast-forward — sim steps per frame. Changes only how fast you watch, never the outcome.' }),
  seed: z.number().int().default(31337)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true, collapsed: true,
            help: 'Any integer. The same seed + settings always replays the same hunt. A fresh visit rolls a new one.' }),
})

export type FlockVsHunterConfig = z.infer<typeof flockVsHunterSchema>
