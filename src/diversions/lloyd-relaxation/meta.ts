import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'lloyd-relaxation',
  title: 'Lloyd Relaxation',
  description: 'A chaotic spatter of seeds relaxes itself into a calm honeycomb: each cell slides to the centre of its Voronoi neighbourhood, over and over, until the field anneals into the even, hexagon-dominated tiling of soap foam and dragonfly wings — and keeps gently breathing so it never quite freezes.',
  kind: '2d',
} as const satisfies DiversionMeta
