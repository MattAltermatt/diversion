import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'vicsek',
  title: 'Vicsek Flock',
  description: 'Self-propelled particles that just steer toward their neighbours’ average '
    + 'heading, plus a little noise. Turn the noise down and a directionless swarm '
    + 'spontaneously condenses into one coherent flock — the phase transition that started '
    + 'the whole field of collective motion.',
  kind: '2d',
} as const satisfies DiversionMeta
