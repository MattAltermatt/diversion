import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'binary-ring',
  title: 'Binary Ring',
  description: 'Concentric rings count up in binary — arc segments pulse to an '
    + 'evolving bit pattern behind a warm rising-sun glow. A hypnotic radial clock.',
  kind: '2d',
} as const satisfies DiversionMeta
