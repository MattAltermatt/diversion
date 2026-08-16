import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'lightning',
  title: 'Lightning',
  description: 'Branching bolts grown by the dielectric breakdown model — a leader crawls, flash-completes, fades to ember.',
  kind: '2d',
} as const satisfies DiversionMeta
