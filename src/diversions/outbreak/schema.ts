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
  speed: z.number().int().min(1).max(4).default(1)
    .meta({ section: 'Motion', ui: 'slider', min: 1, max: 4, step: 1, label: 'Speed',
            help: 'Visual fast-forward — sim steps per frame. Changes only how fast you watch, never the outcome.' }),
  seed: z.number().int().default(1337)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed + settings always replays the same outbreak. A fresh visit rolls a new one.' }),
})

export type OutbreakConfig = z.infer<typeof outbreakSchema>
