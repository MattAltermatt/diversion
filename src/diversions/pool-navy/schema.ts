import { z } from 'zod'
import { DEFAULTS, type PoolNavyConfig } from './config'

/**
 * Named pools rather than two dimension sliders.
 *
 * Pool size is the one real lever on how close-quarters the fighting looks —
 * measured, engagement range tracks the crowding distance 0.5*sqrt(area/N)
 * within 1% — so it earns a control. Two raw metre sliders would let a viewer
 * build a 1-D corridor, and width/height are structural (they re-run setup).
 */
export const POOLS = {
  kiddie: { widthM: 5.3333, heightM: 3.0 },
  backyard: { widthM: 8, heightM: 4.5 },
  competition: { widthM: 12.8, heightM: 7.2 },
  olympic: { widthM: 25.6, heightM: 14.4 },
} as const

export type PoolName = keyof typeof POOLS

export const poolNavySchema = z.object({
  pool: z
    .enum(['kiddie', 'backyard', 'competition', 'olympic'])
    .default('backyard')
    .meta({
      ui: 'segmented',
      label: 'Pool',
      section: 'Fleet',
      options: [
        { value: 'kiddie', label: 'Kiddie' },
        { value: 'backyard', label: 'Backyard' },
        { value: 'competition', label: 'Competition' },
        { value: 'olympic', label: 'Olympic' },
      ],
      help: 'How much water six boats share. Bigger pools mean longer transits and rarer, more deliberate engagements.',
    }),

  sideSize: z.number().int().min(2).max(24).default(DEFAULTS.sideSize).meta({
    ui: 'slider', label: 'Ships per side', section: 'Fleet',
    min: 2, max: 24, step: 1,
    help: 'Each side opens with this many, and every new faction is allotted the same number before the next colour begins.',
  }),

  tempo: z.number().min(0.1).max(1.5).default(DEFAULTS.tempo).meta({
    ui: 'slider', label: 'Tempo', section: 'Fleet',
    min: 0.1, max: 1.5, step: 0.05,
    help: 'Playback speed. Everything slows together, so the physics is unchanged.',
  }),

  topSpeedMs: z.number().min(0.15).max(0.95).default(DEFAULTS.topSpeedMs).meta({
    ui: 'slider', label: 'Top speed', section: 'Fleet',
    min: 0.15, max: 0.95, step: 0.05,
    help: 'Metres per second for an undamaged hull. A rudder only works when water is flowing over it, so slower boats also turn lazier.',
  }),

  hullHp: z.number().min(30).max(260).default(DEFAULTS.hullHp).meta({
    ui: 'slider', label: 'Hull strength', section: 'Fleet',
    min: 30, max: 260, step: 10,
    help: 'Tougher hulls mean longer fights and a slower stream of new factions.',
  }),

  limpSpeed: z.number().min(0.08).max(1).default(DEFAULTS.limpSpeed).meta({
    // ⚠️ CONDITION, not damage: 20% condition is 80% damage, and the label
    // said the opposite of what the code measures. The floor is 0.08 rather
    // than 0.02 because `limpExponent` clamps at or below SPEED_FLOOR
    // (0.0748), so every stop from 0.02 to 0.07 produced the SAME speed and
    // none of them delivered its named value — six dead slider positions.
    ui: 'slider', label: 'Speed at 20% condition', section: 'Fleet',
    min: 0.08, max: 1, step: 0.01,
    help: 'How badly a wounded hull slows. At 9% a nearly-sunk boat is all but dead in the water; at 100% damage costs it no speed at all.',
  }),

  dreadnoughtChance: z.number().min(0).max(0.5).default(DEFAULTS.dreadnoughtChance).meta({
    ui: 'slider', label: 'Dreadnoughts', section: 'Fleet',
    min: 0, max: 0.5, step: 0.01,
    help: 'Chance a replacement is a dreadnought — huge, slow, and carrying a battery too ponderous to track a gunboat. Never more than one afloat.',
  }),

  background: z.string().default(DEFAULTS.background).meta({
    ui: 'color', label: 'Background', section: 'Color',
    help: 'The water. Every faction colour is solved against it — including the ones you choose — so no hull vanishes into it.',
  }),

  palette: z.array(z.string()).min(2).max(10).default(DEFAULTS.palette).meta({
    ui: 'colorList', label: 'Palette', section: 'Color',
    min: 2, max: 10,
    help: 'The opening factions. Once these are used up, new colours are generated on a golden-angle walk so arrivals never repeat.',
  }),

  showWakes: z.boolean().default(DEFAULTS.showWakes).meta({
    ui: 'toggle', label: 'Wakes', section: 'Color',
    help: 'Wakes are instrumentation: they show the hull slipping sideways against its own track.',
  }),

  seed: z.number().int().default(1).meta({
    ui: 'number', label: 'Seed', section: 'Advanced', collapsed: true, step: 1,
    randomizeOnFreshLoad: true,
    help: 'Pin a number to replay the same battle exactly. Left off, every visit is a fresh one.',
  }),
})

export type PoolNavySchemaConfig = z.infer<typeof poolNavySchema>

/** Flatten the named pool into the dimensions the simulation reads. */
export function toSimConfig(c: PoolNavySchemaConfig): PoolNavyConfig {
  const p = POOLS[c.pool]
  return {
    seed: c.seed,
    tempo: c.tempo,
    poolWidthM: p.widthM,
    poolHeightM: p.heightM,
    sideSize: c.sideSize,
    topSpeedMs: c.topSpeedMs,
    hullHp: c.hullHp,
    limpSpeed: c.limpSpeed,
    dreadnoughtChance: c.dreadnoughtChance,
    background: c.background,
    palette: c.palette,
    showWakes: c.showWakes,
  }
}
