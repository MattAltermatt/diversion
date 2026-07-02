// schema.ts — single source of truth (form + URL codec + Config type).
// Foundation subset (#233); combat (#234), arena/density (#235), juice (#236),
// panic (#237) and presets (#238) extend this.
import { z } from 'zod'

export const outbreakSchema = z.object({
  civilianCount: z.number().int().min(50).max(1200).default(500)
    .meta({ section: 'Population', ui: 'slider', min: 50, max: 1200, step: 10, label: 'Civilians',
            help: 'The contested pool. Both sides drain it — fighters recruit them, the horde bites them. A big crowd makes the tug-of-war legible.' }),
  fighterCount: z.number().int().min(2).max(120).default(30)
    .meta({ section: 'Population', ui: 'slider', min: 2, max: 120, step: 1, label: 'Fighters',
            help: 'Armed survivors. They recruit nearby civilians into more fighters; a zombie that reaches one turns it.' }),
  zombieCount: z.number().int().min(2).max(400).default(40)
    .meta({ section: 'Population', ui: 'slider', min: 2, max: 400, step: 1, label: 'Zombies',
            help: 'The starting horde. Slow but relentless; each bite grows it.' }),
  zombieSpeed: z.number().min(20).max(140).default(52)
    .meta({ section: 'Motion', ui: 'slider', min: 20, max: 140, step: 1, label: 'Zombie speed',
            help: 'Slow-but-relentless is the classic feel — keep it below human speed.' }),
  humanSpeed: z.number().min(20).max(200).default(88)
    .meta({ section: 'Motion', ui: 'slider', min: 20, max: 200, step: 1, label: 'Human speed',
            help: 'Civilians and fighters move faster than the horde — their one edge.' }),
  fighterRange: z.number().min(60).max(150).default(128)
    .meta({ section: 'Combat', ui: 'slider', min: 60, max: 150, step: 1, label: 'Fighter range',
            help: 'How far fighters can shoot. They advance to this range, hold, and kite back if a zombie closes inside it.' }),
  fireRate: z.number().min(1).max(8).default(3.2)
    .meta({ section: 'Combat', ui: 'slider', min: 1, max: 8, step: 0.1, label: 'Fire rate (shots/s)',
            help: 'Shots per second per fighter while a zombie is in range and the magazine has rounds.' }),
  magazine: z.number().int().min(3).max(30).default(9)
    .meta({ section: 'Combat', ui: 'slider', min: 3, max: 30, step: 1, label: 'Magazine',
            help: 'Rounds before a reload. Ammo is infinite; the magazine just sets the rhythm of vulnerability.' }),
  reloadTime: z.number().min(0.5).max(5).default(2.1)
    .meta({ section: 'Combat', ui: 'slider', min: 0.5, max: 5, step: 0.1, label: 'Reload (s)',
            help: 'Seconds a fighter cannot fire while reloading — the window a charging wave exploits.' }),
  bulletSpeed: z.number().min(300).max(1200).default(660)
    .meta({ section: 'Combat', ui: 'slider', min: 300, max: 1200, step: 20, label: 'Bullet speed',
            help: 'Projectile speed in world px/s. Fighters lead their target by this.' }),
  zombieFearRadius: z.number().min(40).max(150).default(120)
    .meta({ section: 'Combat', ui: 'slider', min: 40, max: 150, step: 1, label: 'Zombie caution',
            help: 'How far a calm zombie stands off from a fighter (respecting the guns) — until it is shot and enrages.' }),
  enrageRadius: z.number().min(30).max(150).default(80)
    .meta({ section: 'Combat', ui: 'slider', min: 30, max: 150, step: 1, label: 'Enrage radius',
            help: 'When a zombie is shot, every zombie within this radius flips fear→charge. The wave chains through the shoot→enrage→charge loop.' }),
  enrageTime: z.number().min(1).max(10).default(4.5)
    .meta({ section: 'Combat', ui: 'slider', min: 1, max: 10, step: 0.1, label: 'Enrage duration (s)',
            help: 'How long a shot wakes the horde — enraged zombies drop their caution and charge the nearest fighter.' }),
  agentRadius: z.number().min(1).max(6).default(2.4)
    .meta({ section: 'Look', ui: 'slider', min: 1, max: 6, step: 0.1, label: 'Agent size',
            help: 'Radius of each circle in world pixels.' }),
  civilianColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#efe7d2')
    .meta({ section: 'Look', ui: 'color', label: 'Civilian color',
            help: 'The crowd. A pale neutral so conversions to red/blue read clearly.' }),
  fighterColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#3aa0ff')
    .meta({ section: 'Look', ui: 'color', label: 'Fighter color', help: 'The armed survivors.' }),
  zombieColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#8bd450')
    .meta({ section: 'Look', ui: 'color', label: 'Zombie color', help: 'The horde. Sickly green pops against the neutral crowd.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0b0d10')
    .meta({ section: 'Look', ui: 'color', label: 'Background' }),
  speed: z.number().min(0.1).max(4).default(0.5)
    .meta({ section: 'Motion', ui: 'slider', min: 0.1, max: 4, step: 0.05, label: 'Speed',
            help: 'Playback rate. Below 1 is slow-motion (0.1 is a very slow, meditative watch); above 1 fast-forwards. Only changes how fast you watch, never the outcome.' }),
  seed: z.number().int().default(1337)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed + settings always replays the same outbreak. A fresh visit rolls a new one.' }),
})

export type OutbreakConfig = z.infer<typeof outbreakSchema>
