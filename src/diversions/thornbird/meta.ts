import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'thornbird',
  title: 'Thornbird',
  description: 'A luminous thread-fractal — after xscreensaver’s Thornbird hack '
    + '(Tim Auckland) and Clifford Pickover’s "Bird in a Thornbush" iterated map.',
  kind: '2d',
} as const satisfies DiversionMeta
