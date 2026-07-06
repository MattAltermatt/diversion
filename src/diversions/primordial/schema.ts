// schema.ts — single source of truth (config form + URL codec + Config type).
import { z } from 'zod'
import { WORLD, type PPSConfig } from './pps'

const DEG = Math.PI / 180

export const primordialSchema = z.object({
  // --- Life: the density-dependent motion law ---
  particleCount: z.number().int().min(400).max(6000).default(1600)
    .meta({ section: 'Life', ui: 'slider', min: 400, max: 6000, step: 100, label: 'Particles',
            help: 'Density is the hero. Too few and the soup stays a gas; too many and it packs into a solid foam. Around 1600 (with the default radius) sits in the sweet spot where separated cells form, wander, and divide.' }),
  radius: z.number().min(2).max(12).default(3)
    .meta({ section: 'Life', ui: 'slider', min: 2, max: 12, step: 0.5, label: 'Sense radius (% of world)',
            help: 'How far each particle looks for neighbours, as a percent of the world. The feature scale of the whole system — larger radius means bigger, fewer, denser cells. Raise the particle count to match if you widen it.' }),
  alpha: z.number().min(0).max(360).default(180)
    .meta({ section: 'Life', ui: 'slider', min: 0, max: 360, step: 1, label: 'Alpha — base turn (°)',
            help: 'Fixed turn taken every tick regardless of neighbours. The classic 180° makes lone particles reverse, which is what lets membranes hold together.' }),
  beta: z.number().min(0).max(45).default(17)
    .meta({ section: 'Life', ui: 'slider', min: 0, max: 45, step: 0.5, label: 'Beta — crowd turn (°)',
            help: 'Extra turn per neighbour, toward the more crowded side. The classic 17° is the whole secret behind self-organisation — nudge it and the life changes.' }),
  stepSize: z.number().min(0.02).max(1).default(0.13)
    .meta({ section: 'Life', ui: 'slider', min: 0.02, max: 1, step: 0.01, label: 'Step size',
            help: 'Distance moved each tick, as a fraction of the sense radius. The classic value is ~0.13; higher scatters the cells, lower freezes them.' }),
  stepsPerFrame: z.number().int().min(1).max(4).default(1)
    .meta({ section: 'Life', ui: 'slider', min: 1, max: 4, step: 1, label: 'Speed',
            help: 'Sim ticks per rendered frame — a visual fast-forward. Changes only how fast you watch the cells grow, never the outcome.' }),

  // --- Look ---
  colors: z.array(z.string().regex(/^#[0-9a-fA-F]{8}$/)).min(2).max(7)
    .default(['#0a0a3cff', '#1e5fffff', '#00e0ffff', '#6cff8aff', '#ffd23eff', '#ff3c2eff'])
    .meta({ section: 'Look', ui: 'colorList', min: 2, max: 7, label: 'Density ramp',
            help: 'Each particle is colored by how many neighbours it has: sparse drifters take the cool end, dense membranes glow at the hot end.' }),
  colorMax: z.number().int().min(6).max(60).default(18)
    .meta({ section: 'Look', ui: 'slider', min: 6, max: 60, step: 1, label: 'Ramp peak (neighbours)',
            help: 'Neighbour count that maps to the hottest color. Lower it to make membranes blaze sooner; raise it to reserve the hot end for the very densest cores.' }),
  dotSize: z.number().min(0.5).max(4).default(1.6)
    .meta({ section: 'Look', ui: 'slider', min: 0.5, max: 4, step: 0.1, label: 'Particle size',
            help: 'Radius of each particle dot, in screen pixels.' }),
  halo: z.boolean().default(true)
    .meta({ section: 'Look', ui: 'toggle', label: 'Glow halo',
            help: 'Draw a soft, low-alpha halo under each dot so dense membranes read as glowing cell walls. Layered (not additive) so it keeps its hue at density.' }),
  afterglow: z.number().min(0).max(100).default(24)
    .meta({ section: 'Look', ui: 'slider', min: 0, max: 100, step: 1, label: 'Afterglow',
            help: 'How slowly the previous frame fades. 0 redraws crisp every frame; higher leaves dreamy motion trails as the cells drift.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#04040a')
    .meta({ section: 'Look', ui: 'color', label: 'Background',
            help: 'The dark field the particles glow against. Trails fade toward this color.' }),

  // --- Advanced ---
  seed: z.number().int().default(1337)
    .meta({ section: 'Advanced', collapsed: true, ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed + settings always grows the same primordial soup. A fresh visit rolls a new one.' }),
})

export type PrimordialConfig = z.infer<typeof primordialSchema>

/** Resolve a form config into sim-space (% → world units, degrees → radians,
 *  step-fraction → world units per step). */
export function toPPSConfig(c: PrimordialConfig): PPSConfig {
  const radius = (c.radius / 100) * WORLD
  return {
    particleCount: c.particleCount,
    radius,
    alpha: c.alpha * DEG,
    beta: c.beta * DEG,
    velocity: c.stepSize * radius,
    seed: c.seed,
  }
}
