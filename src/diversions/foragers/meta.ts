import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'foragers',
  title: 'Foragers',
  description: 'A single population evolves tiny brains to find food and dodge poison — no adversary, just visibly getting smarter at the same task, generation over generation.',
  kind: '2d',
} as const satisfies DiversionMeta
