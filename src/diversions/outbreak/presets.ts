// presets.ts — declared data (framework renders one dropdown per group).
// Scenario presets tune the outbreak's balance. The horde-win regime (#239) is the
// population axis: the fighter gun-line snowballs off the CIVILIAN pool, so a small
// pool starves it and the horde overruns, while a large pool feeds an army that
// exterminates. All options share ONE key-set (presetSweep.test.ts #127) and hold
// the non-population dials fixed at the empirically-swept values (zombieSpeed 110,
// humanSpeed 84, sight 30, fireRate 2, fighterRange 128) that these outcomes were
// measured at — so each scenario reproduces its tested behaviour.
import type { PresetGroup } from '../../framework/types'
import type { OutbreakConfig } from './schema'

export const outbreakPresets: PresetGroup<OutbreakConfig>[] = [
  {
    label: 'Scenario',
    options: [
      // Decisive horde win (5/5): too few civilians to build a gun line; the horde overruns.
      { name: 'Overrun', patch: { civilianCount: 60, fighterCount: 3, zombieCount: 350, zombieSpeed: 110, humanSpeed: 84, civilianSight: 30, fireRate: 2, fighterRange: 128 } },
      // Genuine coin-flip (~3/5): the pool is just big enough that some seeds hold, some fall.
      { name: "Knife's Edge", patch: { civilianCount: 100, fighterCount: 3, zombieCount: 350, zombieSpeed: 110, humanSpeed: 84, civilianSight: 30, fireRate: 2, fighterRange: 128 } },
      // Dramatic swing (humans win): 2 fighters recover from a ~490-zombie peak by arming the crowd.
      { name: 'Turning Tide', patch: { civilianCount: 300, fighterCount: 2, zombieCount: 350, zombieSpeed: 110, humanSpeed: 84, civilianSight: 30, fireRate: 2, fighterRange: 128 } },
      // Confident hold: a strong garrison arms the pool and exterminates a heavy horde.
      { name: 'Last Stand', patch: { civilianCount: 300, fighterCount: 10, zombieCount: 350, zombieSpeed: 110, humanSpeed: 84, civilianSight: 30, fireRate: 2, fighterRange: 128 } },
      // Big populous city: a large crowd, a modest horde surge, then recovery — a calmer watch.
      { name: 'Standoff', patch: { civilianCount: 600, fighterCount: 30, zombieCount: 80, zombieSpeed: 110, humanSpeed: 84, civilianSight: 90, fireRate: 2, fighterRange: 128 } },
    ],
  },
]
