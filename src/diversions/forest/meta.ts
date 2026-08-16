import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'forest',
  title: 'Forest',
  description: 'A grove of recursive fractal trees sprouting across a misty ground, then fading to regrow.',
  kind: '2d',
} as const satisfies DiversionMeta
