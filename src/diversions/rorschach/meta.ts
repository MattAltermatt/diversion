import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'rorschach',
  title: 'Rorschach',
  description: 'A symmetric inkblot blooms, holds, and dissolves — an endless, mirror-perfect Rorschach card.',
  kind: '2d',
} as const satisfies DiversionMeta
