import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'abstractile',
  title: 'Abstractile',
  description: 'An ornate symmetric mosaic lays itself down tile by tile — half-squares, Truchet arcs '
    + 'and corner circles clicking edge to edge into a flowing kaleidoscopic tessellation, quilt and '
    + 'Islamic-tile at once — then holds, dissolves, and reseeds a fresh pattern.',
  kind: '2d',
} as const satisfies DiversionMeta
