import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'delaunay',
  title: 'Delaunay Mesh',
  description: 'A field of drifting points, continuously re-triangulated into the ' +
    'Delaunay mesh that connects each to its nearest neighbours — the empty-circumcircle ' +
    'condition that also underlies terrain modelling and low-poly art. Rendered as a shifting ' +
    'web of faceted triangles, like an animated cut crystal. Clean-room port of the xscreensaver ' +
    'hack "delaunay" (Jamie Zawinski / tessellimage, itself built on Paul Bourke\'s classic ' +
    'incremental triangulation algorithm).',
  kind: '2d',
} as const satisfies DiversionMeta
