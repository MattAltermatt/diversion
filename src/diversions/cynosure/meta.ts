import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'cynosure',
  title: 'Cynosure',
  description: 'Drifting translucent rectangles overlap into soft, ever-recomposing color fields — '
    + 'a calm Rothko/Albers abstraction that slowly breathes and recomposes.',
  kind: '2d',
} as const satisfies DiversionMeta
