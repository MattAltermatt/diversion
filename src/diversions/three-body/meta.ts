import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'three-body',
  title: 'Three-Body Choreographies',
  description: 'A catalogue of real periodic three-body orbits — Šuvakov–Dmitrašinović, Simó’s '
    + 'figure-eight and more — integrated numerically. Three bodies chase each other around a fixed '
    + 'closed choreography, each leaving a glowing trail, cycling one at a time forever.',
  kind: '2d',
} as const satisfies DiversionMeta
