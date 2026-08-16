import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'lmorph',
  title: 'Lmorph',
  description: 'A single luminous closed curve fluidly morphs between elegant shapes — circle '
    + 'melts into star into flower into gear into heart — holding, cycling colour, forever.',
  kind: '2d',
} as const satisfies DiversionMeta
