import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'sand-stroke',
  title: 'Sand Stroke',
  description: 'Grainy sand-painted colour ribbons that accrete across the canvas. '
    + 'After Jared Tarbell’s Sand Stroke (complexification.net).',
  kind: '2d',
} as const satisfies DiversionMeta
