import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'halo',
  title: 'Halo',
  description: 'Drifting halos of concentric rings beat into slowly shifting moire '
    + 'fringe rosettes — luminous, or XOR-cancelling into crisp fringes.',
  kind: '2d',
} as const satisfies DiversionMeta
