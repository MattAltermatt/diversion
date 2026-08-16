import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'intermomentary',
  title: 'InterMomentary',
  description: 'Rings of overlapping circles slowly rotate and breathe; their crossings '
    + 'weave shifting rosette interference patterns — moire from circle intersections.',
  kind: '2d',
} as const satisfies DiversionMeta
