import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'voter',
  title: 'Voter Model',
  description: 'The voter model: every cell just copies a random neighbour\'s opinion — pure '
    + 'imitation, no energy, no surface tension. That alone coarsens the field into domains of '
    + 'like opinion whose boundaries wander and merge, until the lattice drifts to consensus.',
  kind: '2d',
} as const satisfies DiversionMeta
