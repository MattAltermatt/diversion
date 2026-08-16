import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'platonic-folding',
  title: 'Platonic Folding',
  description: "A Platonic solid's flattened net folds itself shut into shape, turns slowly in "
    + 'the light, then unfolds flat again — origami built from hinge geometry, not paper. '
    + "Inspired by the unfolding-polyhedra lineage of jwz's xscreensaver hacks (polyhedra / "
    + 'polytopes); this fold construction and rendering are an original implementation.',
  kind: '2d',
} as const satisfies DiversionMeta
