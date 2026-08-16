import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'game-of-life',
  title: 'Game of Life',
  description: 'Conway’s cellular automaton and its cousins — cells born and dying by their neighbours, tinted by age and trailing soft ghosts as they pass; when the board settles it reseeds into fresh chaos.',
  kind: '2d',
} as const satisfies DiversionMeta
