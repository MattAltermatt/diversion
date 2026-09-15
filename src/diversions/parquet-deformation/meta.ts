import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'parquet-deformation',
  title: 'Parquet Deformation',
  description:
    "A field of tiles that is quietly not identical: the lattice is a plain grid of squares, but the shape of its edges is a function of where you are on the plane, so squares loosen into curling lace across the screen and back again. After William Huff's 1960s studio exercise, built on Craig Kaplan's curve-evolution schemes.",
  kind: '2d',
} as const satisfies DiversionMeta
