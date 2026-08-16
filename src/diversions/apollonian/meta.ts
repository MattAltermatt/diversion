import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'apollonian',
  title: 'Apollonian Gasket',
  description: 'Mutually-tangent circles packed into every gap by the Descartes Circle Theorem — '
    + 'a self-similar fractal foam. After xscreensaver’s apollonian.',
  kind: '2d',
} as const satisfies DiversionMeta
