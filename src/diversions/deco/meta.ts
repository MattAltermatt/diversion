import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'deco',
  title: 'Deco',
  description: 'An art-deco composition builds itself: a single rectangle subdivides again and again by the golden ratio into a De Stijl mosaic of colour, settling into place depth by depth, then clearing to compose anew.',
  kind: '2d',
} as const satisfies DiversionMeta
