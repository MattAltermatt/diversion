import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'cloudlife',
  title: 'CloudLife',
  description: 'An aging Conway’s Life: a cell that outlives its max age starts counting triple '
    + 'toward its neighbours’ next generation, so old formations explode instead of freezing — the '
    + 'churn reads as slow, billowing clouds that never settle, tinted young to old. Port of Don '
    + 'Marti’s xscreensaver hack “cloudlife.”',
  kind: '2d',
} as const satisfies DiversionMeta
