import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'excitable-media',
  title: 'Excitable Media',
  description: 'A chemical medium ignites into rotating spiral waves — bright fronts chasing their own recovering tails, like a Belousov-Zhabotinsky dish.',
  kind: 'webgl',
} as const satisfies DiversionMeta
