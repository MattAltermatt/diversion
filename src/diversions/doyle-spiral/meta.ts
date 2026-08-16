import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'doyle-spiral',
  title: 'Doyle Spiral',
  description: 'Mutually-tangent circles whose radii scale by a fixed ratio, coiling into '
    + 'logarithmic-spiral arms that zoom forever in a seamless loxodromic flow. After Doyle / '
    + 'Robin Houston’s numerics.',
  kind: '2d',
} as const satisfies DiversionMeta
