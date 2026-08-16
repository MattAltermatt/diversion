import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'gravity-wells',
  title: 'Gravity Wells',
  description: 'Particles caught in a field of gravity wells that appear and fade.',
  kind: '2d',
} as const satisfies DiversionMeta
