import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'lenia',
  title: 'Lenia',
  description: 'A continuous Game of Life — a living broth where glowing cells endlessly condense, swim, merge, and dissolve.',
  kind: 'webgl',
} as const satisfies DiversionMeta
