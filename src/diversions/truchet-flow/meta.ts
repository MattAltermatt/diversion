import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'truchet-flow',
  title: 'Truchet Flow',
  description: 'A maze of randomly-turned tiles weaves endless flowing loops, with bright current streaming along every curve like charge through a circuit board — ordered, architectural calm.',
  kind: '2d',
} as const satisfies DiversionMeta
