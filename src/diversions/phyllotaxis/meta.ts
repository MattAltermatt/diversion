import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'phyllotaxis',
  title: 'Phyllotaxis',
  description: 'A golden-angle fountain: shapes are born at the centre and stream outward forever.',
  kind: '2d',
} as const satisfies DiversionMeta
