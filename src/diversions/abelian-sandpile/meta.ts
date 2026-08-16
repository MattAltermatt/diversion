import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'abelian-sandpile',
  title: 'Abelian Sandpile',
  description: 'Grains of sand rain onto one point and topple whenever four pile up — the avalanche spreads into a self-similar fractal mandala that always settles the same way, no matter the order.',
  kind: '2d',
} as const satisfies DiversionMeta
