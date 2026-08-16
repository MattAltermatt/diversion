import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'lockward',
  title: 'Lockward',
  description: 'Concentric rings of radial blades counter-rotate into an '
    + 'interlocking clockwork churn — a luminous, kaleidoscopic rose window.',
  kind: '2d',
} as const satisfies DiversionMeta
