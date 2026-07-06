// schema.ts — single source of truth (config form + URL codec + Config type).
import { z } from 'zod'

export const fireflySchema = z.object({
  fireflyCount: z.number().int().min(150).max(2500).default(900)
    .meta({ section: 'Swarm', ui: 'slider', min: 150, max: 2500, step: 50, label: 'Fireflies',
            help: 'How many oscillating fireflies fill the field. More reads as a denser sky; '
                + 'the travelling waves of light are clearest a few hundred and up.' }),
  motion: z.enum(['static', 'drift']).default('static')
    .meta({ section: 'Swarm', ui: 'segmented', options: ['static', 'drift'], label: 'Motion',
            help: 'Static: fireflies hold their positions (a still meadow). '
                + 'Drift: they wander very slowly, so the light patterns keep reshaping.' }),

  flashRate: z.number().min(0.1).max(1.5).default(0.5)
    .meta({ section: 'Synchrony', ui: 'slider', min: 0.1, max: 1.5, step: 0.05, label: 'Flash tempo',
            help: 'Base flashes per second — each firefly charges up and flashes at roughly this '
                + 'rate. Lower is slower and more hypnotic.' }),
  coupling: z.number().min(0).max(0.4).default(0.1)
    .meta({ section: 'Synchrony', ui: 'slider', min: 0, max: 0.4, step: 0.01, label: 'Coupling (ε)',
            help: 'How hard each flash nudges its neighbours toward flashing too. This is the sync '
                + 'strength — 0 leaves every firefly on its own (chaotic flicker); higher pulls the '
                + 'swarm into travelling waves and unison.' }),
  neighbourRadius: z.number().min(0.02).max(0.35).default(0.12)
    .meta({ section: 'Synchrony', ui: 'slider', min: 0.02, max: 0.35, step: 0.01, label: 'Neighbour reach',
            help: 'How far a flash reaches, as a fraction of the field. Small = local ripples that '
                + 'take time to organize; large = the whole swarm couples and snaps to unison faster.' }),
  frequencySpread: z.number().min(0).max(0.4).default(0.12)
    .meta({ section: 'Synchrony', ui: 'slider', min: 0, max: 0.4, step: 0.01, label: 'Frequency spread',
            help: 'How much fireflies differ in their natural tempo. A little heterogeneity keeps a '
                + 'synced swarm breathing in and out forever instead of locking dead-still — leave it above 0.' }),
  phaseNoise: z.number().min(0).max(0.3).default(0.02)
    .meta({ section: 'Synchrony', ui: 'slider', min: 0, max: 0.3, step: 0.01, label: 'Jitter',
            help: 'A touch of random flicker in each firefly’s timing. Adds life and keeps perfect '
                + 'sync from ever fully freezing. 0 = clockwork.' }),

  flashColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#c9ff5e')
    .meta({ section: 'Look', ui: 'color', label: 'Flash color',
            help: 'The color of a firefly’s pulse. Warm yellow-greens read most like real fireflies.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#050a08')
    .meta({ section: 'Look', ui: 'color', label: 'Background',
            help: 'The night. Keep it deep and dark so the flashes pop.' }),
  glowSize: z.number().min(4).max(48).default(16)
    .meta({ section: 'Look', ui: 'slider', min: 4, max: 48, step: 1, label: 'Glow size',
            help: 'Radius of each flash’s halo, in pixels. Larger glows bloom and overlap into '
                + 'sheets of light when the swarm flashes together.' }),
  afterglow: z.number().min(0.05).max(2).default(0.45)
    .meta({ section: 'Look', ui: 'slider', min: 0.05, max: 2, step: 0.05, label: 'Afterglow',
            help: 'How long a flash lingers before fading, in seconds. Longer leaves soft trails of '
                + 'light so the waves smear beautifully.' }),

  seed: z.number().int().default(7)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true, collapsed: true,
            help: 'Any integer. The same seed regenerates the same field of fireflies and the same '
                + 'dance into sync. A fresh visit rolls a new one.' }),
})

export type FireflyConfig = z.infer<typeof fireflySchema>
