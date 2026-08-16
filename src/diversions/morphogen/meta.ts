import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'morphogen',
  title: 'Morphogen',
  description: 'Diffusing chemicals lay down gradients that cells read into a body plan — territories, eyespots, a French flag.',
  kind: 'webgl',
} as const satisfies DiversionMeta
