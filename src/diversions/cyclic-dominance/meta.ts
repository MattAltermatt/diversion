import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'cyclic-dominance',
  title: 'Cyclic Dominance',
  description: 'Spatial rock-paper-scissors on a lattice — three species chase each other in an endless loop, churning into large, slowly-curling wavefronts of coexistence that never settle.',
  kind: '2d',
} as const satisfies DiversionMeta
