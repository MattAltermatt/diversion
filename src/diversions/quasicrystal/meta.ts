import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'quasicrystal',
  title: 'Quasicrystal',
  description: 'A lattice of overlapping wave gratings interferes into a shimmering, ever-shifting quasiperiodic pattern with five-, seven-, or nine-fold symmetry.',
  kind: 'webgl',
} as const satisfies DiversionMeta
