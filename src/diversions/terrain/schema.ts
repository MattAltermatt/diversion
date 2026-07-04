import { z } from 'zod'

// Terrain — a fractal mountain range (GH #96, after xscreensaver `triangle`).
// Layered ridgelines receding into atmospheric haze under a gradient dawn/dusk
// sky, slowly drifting by. One Zod schema is the single source of truth for the
// config form, the URL codec, AND the Config type.

export const TIMES_OF_DAY = ['Auto', 'Dawn', 'Day', 'Dusk', 'Night', 'Alpenglow'] as const

export const terrainSchema = z.object({
  ridgeLayers: z.number().int().min(2).max(12).default(7)
    .meta({ section: 'Range', ui: 'slider', min: 2, max: 12, step: 1, label: 'Ridge layers',
            help: 'How many mountain ridgelines stack front-to-back. More layers deepen the '
                + 'misty recession; fewer feel sparse and graphic.' }),
  peakHeight: z.number().min(0.15).max(1).default(0.55)
    .meta({ section: 'Range', ui: 'slider', min: 0.15, max: 1, step: 0.01, label: 'Peak height',
            help: 'How tall the ridges rise. Low = rolling foothills; high = dramatic alps.' }),
  roughness: z.number().min(0.3).max(0.75).default(0.52)
    .meta({ section: 'Range', ui: 'slider', min: 0.3, max: 0.75, step: 0.01, label: 'Roughness',
            help: 'Fractal dimension — how much fine, jagged detail rides on the big shapes. '
                + 'Low = smooth, sculpted ridges; high = craggy and broken.' }),
  detail: z.number().int().min(2).max(8).default(6)
    .meta({ section: 'Range', ui: 'slider', min: 2, max: 8, step: 1, label: 'Detail',
            help: 'Number of fractal octaves summed into each ridge. More octaves add finer '
                + 'crenellation; fewer keep the silhouette simple.' }),
  scrollSpeed: z.number().min(0).max(40).default(6)
    .meta({ section: 'Motion', ui: 'slider', min: 0, max: 40, step: 1, label: 'Scroll speed',
            help: 'How fast the endless range drifts sideways. Nearer ridges scroll faster '
                + '(parallax). 0 = a still landscape.' }),
  morphSpeed: z.number().min(0).max(1).default(0.2)
    .meta({ section: 'Motion', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Morph speed',
            help: 'Slowly reshapes the mountains as they pass, so the range never repeats. '
                + '0 = a rigid, unchanging profile.' }),
  atmosphere: z.number().min(0).max(1).default(0.8)
    .meta({ section: 'Sky', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Atmosphere',
            help: 'Haze strength. Higher washes distant ridges paler toward the sky colour for '
                + 'that deep "misty mountains" recession; 0 keeps every layer equally dark.' }),
  timeOfDay: z.enum(TIMES_OF_DAY).default('Auto')
    .meta({ section: 'Sky', ui: 'select', options: [...TIMES_OF_DAY], label: 'Time of day',
            help: 'Sky + light palette. Auto drifts slowly through night → dawn → day → dusk; '
                + 'the others hold one mood (Alpenglow = pink-and-gold mountain light).' }),
  cycleMinutes: z.number().min(1).max(60).default(6)
    .meta({ section: 'Sky', ui: 'slider', min: 1, max: 60, step: 1, label: 'Cycle minutes',
            showWhen: { field: 'timeOfDay', equals: 'Auto' },
            help: 'Minutes for one full night→day→night loop when Time of day is Auto.' }),
  seed: z.number().int().default(7421)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed regenerates the same mountain range. A fresh visit '
                + 'rolls a new one.' }),
})

export type TerrainConfig = z.infer<typeof terrainSchema>
