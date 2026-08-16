import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'asteroids',
  title: 'Asteroids',
  description: 'A slow drift through a painted Homeworld sky — a soft purple nebula and dark '
    + 'dust lanes veiling one low sun, with a field of tumbling asteroids adrift in the foreground.',
  kind: '2d',
} as const satisfies DiversionMeta
