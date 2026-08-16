import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'penrose',
  title: 'Penrose',
  description: 'The famous aperiodic tiling: two rhombs — one fat, one thin — cover the plane in a five-fold pattern that never repeats, grown by repeatedly subdividing each tile at the golden ratio, and turning forever.',
  kind: '2d',
} as const satisfies DiversionMeta
