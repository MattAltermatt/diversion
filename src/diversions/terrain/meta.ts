import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'terrain',
  title: 'Terrain',
  description: 'Fractal mountain ridgelines recede into misty haze under a slowly shifting '
    + 'dawn-to-dusk sky, drifting endlessly by. After xscreensaver’s triangle.',
  kind: '2d',
} as const satisfies DiversionMeta
