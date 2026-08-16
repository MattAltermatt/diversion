import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'boxcar2d',
  title: 'BoxCar2D',
  description: 'A genetic algorithm evolves little 2D cars across an endless hilly track — watch them go from flailing wrecks to confident hill-climbers, generation by generation. Clean-room remake of BoxCar2D (Rafael Matsunaga).',
  kind: '2d',
} as const satisfies DiversionMeta
