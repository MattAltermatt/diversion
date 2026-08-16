import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'pursuit-evasion',
  title: 'Pursuit-Evasion',
  description: 'Predators and prey evolve tiny brains against each other — hunters learn to intercept, prey learn to juke, hunters learn to cut the angle. A Red Queen arms race that never settles.',
  kind: '2d',
} as const satisfies DiversionMeta
