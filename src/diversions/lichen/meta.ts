import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'lichen',
  title: 'Lichen',
  description: 'A sea cliff colonised over centuries: five species spread from scattered founders and stop dead where they meet, sorting into bands by how much salt spray reaches them, until a storm scrubs part of the rock bare and the race to refill begins again. Species are rendered as flat crusts, which two of the five are not.',
  kind: '2d',
} as const satisfies DiversionMeta
