import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'physarum',
  title: 'Physarum',
  description: 'Slime-mold agents grow and rewire luminous transport networks.',
  kind: 'webgl',
} as const satisfies DiversionMeta
