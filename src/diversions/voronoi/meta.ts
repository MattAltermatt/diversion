import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'voronoi',
  title: 'Animated Voronoi',
  description: 'A field of colored Voronoi cells where every seed drifts its own slow, never-'
    + 'repeating orbit — cells grow, shrink, and swap neighbors as the mosaic flows like stained '
    + 'glass. A clean-room port of xscreensaver\'s voronoi hack by Jamie Zawinski, reimagined on a '
    + '2D canvas with a Delaunay-triangulation tessellation recomputed every frame.',
  kind: '2d',
} as const satisfies DiversionMeta
