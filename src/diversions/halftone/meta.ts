import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'halftone',
  title: 'Halftone',
  description: 'Invisible masses orbiting beneath a newsprint dot screen — the field swells and flows.',
  kind: 'webgl',
} as const satisfies DiversionMeta
