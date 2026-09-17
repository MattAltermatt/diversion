import { describe, expect, it } from 'vitest'
import { makeColony } from './colony'
import { makeRng } from './noise'
import { buildRock, computeSterile, computeWet } from './rock'
import {
  ALL_KINDS, NATURAL, WHIMSY, beginStorm, drawSeverity, makeMask, pickKind, stepStorm,
  survivorRoll,
} from './storm'

function rock() {
  const r = buildRock(250, 160, 1)
  computeWet(r, 0.55, 0.5)
  computeSterile(r, 0, 0)
  return r
}

describe('severity', () => {
  it('is skewed hard toward the small', () => {
    // Measured: median 0.212, 54.6% under a quarter strength. Assert the MEDIAN — a mean
    // test passes for a uniform distribution, which is the mutant that matters here.
    const vs = Array.from({ length: 20_000 }, (_, i) => drawSeverity(makeRng(i + 1))).sort((a, b) => a - b)
    expect(vs[vs.length >> 1]).toBeLessThan(0.25)
    expect(vs[vs.length >> 1]).toBeGreaterThan(0.15)
    expect(vs[0]).toBeLessThan(0.1)
    expect(vs[vs.length - 1]).toBeGreaterThan(0.9)
  })
})

describe('mask selection', () => {
  it('strips a non-trivial area for every kind in both families', () => {
    // A mask that silently matches nothing, or everything, is the failure mode — and it is
    // invisible on a screenshot of a mostly-bare rock. Measured range at sev 0.5:
    // spiral 5.6% (smallest) to band 48.6% (largest).
    const r = rock()
    for (const kind of ALL_KINDS) {
      let total = 0
      for (let t = 0; t < 8; t++) {
        const m = makeMask(kind, 0.5, r, makeRng(100 + t))
        let c = 0
        for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) if (m.hit(x, y)) c++
        total += c / (r.w * r.h)
      }
      const mean = total / 8
      expect(mean, `${kind} selects nothing`).toBeGreaterThan(0.01)
      expect(mean, `${kind} selects everything`).toBeLessThan(0.70)
    }
  })

  it('makes the slab ragged, not a clean rectangle', () => {
    // Asserted as a PAIRED comparison against the zero-jitter version of the same mask,
    // not as an absolute floor: an unrotated jitter-free convex region is HV-convex, so
    // its exposed-edge count equals its bounding-box perimeter exactly, while the real
    // one exceeds it. The magnitude varies a lot by seed; the direction does not.
    const r = rock()
    const edges = (hit: (x: number, y: number) => boolean) => {
      let e = 0, minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9
      for (let y = 0; y < r.h; y++) {
        for (let x = 0; x < r.w; x++) {
          if (!hit(x, y)) continue
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
          if (!hit(x - 1, y)) e++
          if (!hit(x + 1, y)) e++
          if (!hit(x, y - 1)) e++
          if (!hit(x, y + 1)) e++
        }
      }
      const bbox = 2 * (maxX - minX + 1) + 2 * (maxY - minY + 1)
      return e / bbox
    }
    let ragged = 0
    for (let t = 0; t < 6; t++) {
      const m = makeMask('slab', 0.5, r, makeRng(200 + t))
      if (edges(m.hit) > 1.02) ragged++
    }
    expect(ragged).toBeGreaterThanOrEqual(5)
  })
})

describe('whimsy selects the family', () => {
  it('never carves whimsy at 0 and always does at 100', () => {
    // ⚠️ Earlier versions of these two tests declared a LOCAL `pickKind` with the same
    // body and tested that. They read like imports and touched no shipped code: inverting
    // storm.ts's own ternary — the Whimsy dial doing the exact opposite of its help text
    // at every setting — left the whole suite green.
    const rnd = makeRng(1)
    for (let i = 0; i < 2000; i++) expect(WHIMSY).not.toContain(pickKind(0, rnd))
    for (let i = 0; i < 2000; i++) expect(NATURAL).not.toContain(pickKind(100, rnd))
  })

  it('splits near the dial at a mid value, so a halved probability fails', () => {
    // Probing only the endpoints lets a mutant that halves the rate pass both.
    const rnd = makeRng(7)
    let whimsical = 0
    const N = 20_000
    for (let i = 0; i < N; i++) {
      if ((WHIMSY as readonly string[]).includes(pickKind(50, rnd))) whimsical++
    }
    expect(whimsical / N).toBeGreaterThan(0.45)
    expect(whimsical / N).toBeLessThan(0.55)
  })
})

describe('the scrub', () => {
  it('takes many steps rather than landing all at once', () => {
    const r = rock()
    const colony = makeColony(r.w * r.h)
    colony.occ.fill(0)
    const storm = beginStorm('bite', 0.8, r, makeRng(5))
    let steps = 0
    while (stepStorm(storm, colony, 1 / 30)) steps++
    expect(steps).toBeGreaterThan(20)
  })

  it('leaves a sparse remnant standing', () => {
    // Measured 8.5%, matching the SURVIVE constant exactly. The probe's version used a
    // hash that could not return above 0.5, so it left 17% — double what it documented.
    const r = rock()
    const colony = makeColony(r.w * r.h)
    colony.occ.fill(0)
    const storm = beginStorm('bite', 0.8, r, makeRng(5))
    while (stepStorm(storm, colony, 1 / 30));
    const survived = (storm.cells.length - storm.stripped) / storm.cells.length
    expect(survived).toBeGreaterThan(0.04)
    expect(survived).toBeLessThan(0.14)
  })

  it('keys the survivor roll on the storm, not just the cell', () => {
    // Tested directly, because comparing two whole storms cannot see this: different
    // seeds move the MASK too, so the struck cells differ and the occupancy differs
    // whatever the roll does. That is exactly how a constant-keyed roll survived the
    // first version of this test. With a constant key the surviving indices are the same
    // subset in every storm of every run, forever.
    const idx = Array.from({ length: 20_000 }, (_, i) => i * 7)
    const survivors = (salt: number) => new Set(idx.filter(i => survivorRoll(i, salt) < 0.085))
    const a = survivors(12345), b = survivors(999)
    expect(a.size).toBeGreaterThan(1000)
    let shared = 0
    for (const i of a) if (b.has(i)) shared++
    // Independent draws would share ~8.5% of A; a constant key shares 100%.
    expect(shared / a.size).toBeLessThan(0.3)
  })

  it('gives a different remnant on a different storm', () => {
    // The point of survivors is that each regrowth starts from a different scatter. Keying
    // the roll on the cell index alone makes the remnant the SAME subset forever.
    const r = rock()
    const remnant = (seed: number) => {
      const colony = makeColony(r.w * r.h)
      colony.occ.fill(0)
      const storm = beginStorm('bite', 0.8, r, makeRng(seed))
      while (stepStorm(storm, colony, 1 / 30));
      return colony.occ
    }
    const a = remnant(5), b = remnant(6)
    let differ = 0
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) differ++
    expect(differ).toBeGreaterThan(1000)
  })

  it('sweeps in a SPIRAL, not in raster order', () => {
    // The spiral is the storm's stated signature — module header, gallery entry, and the
    // Chrome checklist ("visibly spirals rather than blinking") — but counting steps passes
    // for raster order too, so `TURNS` and `COIL` guarded nothing.
    //
    // ⚠️ Correlating phase against atan2 does NOT work: phase wraps 2.6 times over a full
    // turn, so a linear correlation is ~0.05 for the correct implementation. What actually
    // separates the two is WHERE the early cells are. Raster order scrubs the top rows
    // first; a spiral takes a wedge that spans nearly the whole height immediately.
    const r = rock()
    const storm = beginStorm('bite', 0.8, r, makeRng(11))
    const rowOf = (i: number) => Math.floor(i / r.w)
    const rows = Array.from(storm.cells, rowOf)
    const allSpan = Math.max(...rows) - Math.min(...rows)
    const firstTenth = rows.slice(0, Math.floor(rows.length * 0.1))
    const earlySpan = Math.max(...firstTenth) - Math.min(...firstTenth)
    // Raster order would give ~0.1 here; a spiral reaches most of the height at once.
    expect(earlySpan / allSpan).toBeGreaterThan(0.5)
  })

  it('marks scour on struck cells, including already-bare ones', () => {
    const r = rock()
    const colony = makeColony(r.w * r.h) // all bare
    const storm = beginStorm('bite', 0.6, r, makeRng(3))
    while (stepStorm(storm, colony, 1 / 30));
    let marked = 0
    for (const v of colony.scour) if (v > 0) marked++
    expect(marked).toBe(storm.cells.length)
  })
})
