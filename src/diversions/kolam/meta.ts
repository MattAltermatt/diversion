import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'kolam',
  title: 'Kolam',
  description: 'A threshold drawing on a swept courtyard floor: an unseen hand lays a symmetric '
    + 'figure in rice flour — a hatched centre, banded rings drawn as bundles of parallel strokes, '
    + 'rings of small motifs, spiral terminals and a scalloped lace edge closed with a red-ochre '
    + 'kaavi line — then holds it, and begins a different one.',
  kind: '2d',
} as const satisfies DiversionMeta
