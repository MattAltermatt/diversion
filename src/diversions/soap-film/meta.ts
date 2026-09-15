import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'soap-film',
  title: 'Soap Film',
  description: 'A soap film drains, blooms through the interference colours, goes black, and tears.',
  kind: 'webgl',
} as const satisfies DiversionMeta
