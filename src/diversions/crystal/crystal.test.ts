import { describe, it, expect } from 'vitest'
import { crystalSchema } from './schema'
import {
  GROUPS, GROUP_IDS, mul, detM, cartOrient, type Mat, type GroupId,
} from './groups'
import { createState, buildMotif, offsetRadius } from './wallpaper'
import { resolvePalette } from './palettes'

const ID: Mat = [1, 0, 0, 1]
const matEq = (a: Mat, b: Mat, eps = 1e-9) => a.every((v, i) => Math.abs(v - b[i]) < eps)

/** smallest k in 1..8 with M^k = I, else 0 */
function rotOrder(m: Mat): number {
  let cur = m
  for (let k = 1; k <= 8; k++) {
    if (matEq(cur, ID)) return k
    cur = mul(cur, m)
  }
  return 0
}

const EXPECTED_MAX_ROT: Record<GroupId, number> = {
  p1: 1, p2: 2, pm: 1, pg: 1, cm: 1, pmm: 2, pmg: 2, pgg: 2, cmm: 2,
  p4: 4, p4m: 4, p4g: 4, p3: 3, p3m1: 3, p31m: 3, p6: 6, p6m: 6,
}
// groups whose transform set contains a PURE mirror (det -1, no glide translation)
const PURE_MIRROR: GroupId[] = ['pm', 'cm', 'pmm', 'pmg', 'cmm', 'p4m', 'p4g', 'p3m1', 'p31m', 'p6m']
// groups with a reflection realised ONLY as a glide (det -1 op, all with t ≠ 0)
const GLIDE_ONLY: GroupId[] = ['pg', 'pgg']
// groups with no reflection at all
const NO_REFLECTION: GroupId[] = ['p1', 'p2', 'p4', 'p3', 'p6']

describe('schema', () => {
  it('parses to valid defaults', () => {
    const cfg = crystalSchema.parse({})
    expect(cfg.group).toBe('auto')
    expect(cfg.palette).toBe('auto')
    expect(cfg.cellSize).toBeGreaterThanOrEqual(60)
    expect(cfg.background).toMatch(/^#[0-9a-f]{6}$/i)
  })
  it('rejects a malformed background', () => {
    expect(() => crystalSchema.parse({ background: 'red' })).toThrow()
  })
})

describe('determinism', () => {
  it('same seed → identical group + motif', () => {
    const cfg = crystalSchema.parse({})
    const a = createState({ ...cfg, seed: 42 }, 800, 600)
    const b = createState({ ...cfg, seed: 42 }, 800, 600)
    expect(a.group.id).toBe(b.group.id)
    expect(a.motif).toEqual(b.motif)
    expect(a.colors).toEqual(b.colors)
  })
  it('different seed → different group or motif', () => {
    const cfg = crystalSchema.parse({})
    const a = createState({ ...cfg, seed: 1 }, 800, 600)
    const b = createState({ ...cfg, seed: 7 }, 800, 600)
    const same = a.group.id === b.group.id && JSON.stringify(a.motif) === JSON.stringify(b.motif)
    expect(same).toBe(false)
  })
  it('buildMotif honours complexity and stays in [1,8]', () => {
    const colors = resolvePalette('auto', 3)
    expect(buildMotif(3, 5, colors)).toHaveLength(5)
    expect(buildMotif(3, 99, colors)).toHaveLength(8)
    expect(buildMotif(3, 0, colors)).toHaveLength(1)
  })
})

describe('every group is registered and finite', () => {
  it('has all 17 groups, no NaN', () => {
    expect(GROUP_IDS).toHaveLength(17)
    for (const id of GROUP_IDS) {
      const grp = GROUPS[id]
      expect(grp).toBeDefined()
      const nums = [...grp.b1, ...grp.b2, ...grp.ops.flatMap((o) => [...o.m, ...o.t])]
      expect(nums.every(Number.isFinite)).toBe(true)
    }
  })
})

describe('headline: each group has its claimed symmetry', () => {
  for (const id of GROUP_IDS) {
    const grp = GROUPS[id]

    it(`${id}: lattice is non-degenerate (tiles without gaps)`, () => {
      const B: Mat = [grp.b1[0], grp.b2[0], grp.b1[1], grp.b2[1]]
      expect(Math.abs(detM(B))).toBeGreaterThan(0.1)
    })

    it(`${id}: every op is a rigid isometry (B·M·B⁻¹ orthogonal)`, () => {
      for (const o of grp.ops) {
        const O = cartOrient(grp, o.m)
        // columns orthonormal → the stamped motif is rotated/reflected, never sheared
        expect(O[0] * O[0] + O[2] * O[2]).toBeCloseTo(1, 9)
        expect(O[1] * O[1] + O[3] * O[3]).toBeCloseTo(1, 9)
        expect(O[0] * O[1] + O[2] * O[3]).toBeCloseTo(0, 9)
      }
    })

    it(`${id}: point group (linear parts) is closed under composition`, () => {
      const lin = grp.ops.map((o) => o.m)
      for (const a of lin) {
        for (const b of lin) {
          const p = mul(a, b)
          expect(lin.some((x) => matEq(x, p)), `${id}: product escapes the set`).toBe(true)
        }
      }
    })

    it(`${id}: contains a rotation of order ${EXPECTED_MAX_ROT[id]}`, () => {
      const orders = grp.ops
        .filter((o) => detM(o.m) > 0) // proper rotations only
        .map((o) => rotOrder(o.m))
      expect(Math.max(...orders)).toBe(EXPECTED_MAX_ROT[id])
    })

    it(`${id}: reflection character is correct`, () => {
      const dets = grp.ops.map((o) => detM(o.m))
      const hasReflection = dets.some((d) => d < 0)
      const pureMirror = grp.ops.some((o) => detM(o.m) < 0 && o.t[0] === 0 && o.t[1] === 0)
      if (PURE_MIRROR.includes(id)) expect(pureMirror).toBe(true)
      if (GLIDE_ONLY.includes(id)) { expect(hasReflection).toBe(true); expect(pureMirror).toBe(false) }
      if (NO_REFLECTION.includes(id)) expect(hasReflection).toBe(false)
    })

    it(`${id}: stamp range covers the viewport`, () => {
      const w = 1440, h = 900, cs = 100
      const R = offsetRadius(grp, w, h, cs)
      const screenR = Math.hypot(w, h) / 2
      // both lattice directions reach beyond the screen radius → no edge gaps
      const along1 = Math.hypot(grp.b1[0] * R, grp.b1[1] * R) * cs
      const along2 = Math.hypot(grp.b2[0] * R, grp.b2[1] * R) * cs
      expect(along1).toBeGreaterThanOrEqual(screenR)
      expect(along2).toBeGreaterThanOrEqual(screenR)
    })
  }
})
