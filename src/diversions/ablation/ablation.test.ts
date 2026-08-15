import { describe, it, expect } from 'vitest'
import { ablationSchema, type AblationConfig } from './schema'
import { createState, step, applyConfig, resizeState, type AblationState } from './ablation'
import { EDGE, exposedHistogram } from './front'

const SIZE = { width: 480, height: 360 }

function cfg(over: Partial<AblationConfig> = {}): AblationConfig {
  return { ...ablationSchema.parse({}), ...over }
}

function run(s: AblationState, seconds: number, dt = 1 / 60): void {
  for (let i = 0; i < Math.round(seconds / dt); i++) step(s, dt)
}

function emptyThePicture(s: AblationState): void {
  for (let i = 0; i < s.field.alive.length; i++) {
    if (s.field.alive[i]) { s.field.alive[i] = 0; s.field.aliveCount-- }
  }
}

describe('createState', () => {
  it('starts with a full picture and the whole fleet waiting at the gate', () => {
    const s = createState(cfg({ fleet: 20 }), SIZE)
    expect(s.field.aliveCount).toBe(s.field.cols * s.field.rows)
    expect(s.track.length).toBe(0)
    expect(s.queue.length).toBe(20)
    expect(s.retired.length).toBe(0)
    expect(s.pictures).toBe(0)
  })

  it('sizes the band count to the palette length', () => {
    expect(createState(cfg({ palette: ['#000', '#fff'] }), SIZE).field.bands).toBe(2)
    expect(createState(cfg({ palette: ['#000', '#444', '#888', '#fff'] }), SIZE).field.bands).toBe(4)
  })
})

describe('step', () => {
  it('releases up to capacity and leaves the rest of the fleet queued', () => {
    const s = createState(cfg({ capacity: 4, fleet: 24, spacing: 0 }), SIZE)
    run(s, 3)
    expect(s.track.length).toBe(4)
    // The fleet is closed: nobody is created or destroyed, so the two lists always
    // account for every turret.
    expect(s.track.length + s.queue.length + s.retired.length).toBe(24)
  })

  it('destroys cells over time', () => {
    const s = createState(cfg(), SIZE)
    const before = s.field.aliveCount
    run(s, 20)
    expect(s.field.aliveCount).toBeLessThan(before)
  })

  it('only ever destroys a lane outermost cell — damage stays connected to the border', () => {
    // The load-bearing rule (spec §1): a turret cannot drill, so erosion is a
    // RECEDING SURFACE. A cell only ever dies as the outermost survivor of one of
    // its four lanes, which means everything between it and that edge is already
    // gone — so every dead cell must reach the border through dead cells. An
    // isolated interior hole would mean something struck through living material.
    //
    // NB this is a connectivity property, not a per-column one: left/right turrets
    // eat along ROWS, so a row eaten inward legitimately punches what looks like a
    // gap when you read a single column top to bottom.
    const s = createState(cfg({ capacity: 20, fleet: 24 }), SIZE)
    run(s, 25)
    const { cols, rows, alive } = s.field
    const reached = new Uint8Array(cols * rows)
    const stack: number[] = []
    const visit = (col: number, row: number) => {
      if (col < 0 || row < 0 || col >= cols || row >= rows) return
      const i = row * cols + col
      if (alive[i] === 1 || reached[i] === 1) return
      reached[i] = 1
      stack.push(i)
    }
    for (let col = 0; col < cols; col++) { visit(col, 0); visit(col, rows - 1) }
    for (let row = 0; row < rows; row++) { visit(0, row); visit(cols - 1, row) }
    while (stack.length > 0) {
      const i = stack.pop()!
      const col = i % cols
      const row = (i - col) / cols
      visit(col + 1, row); visit(col - 1, row); visit(col, row + 1); visit(col, row - 1)
    }
    let dead = 0
    for (let i = 0; i < alive.length; i++) {
      if (alive[i] === 0) {
        dead++
        expect(reached[i], `cell ${i % cols},${(i - (i % cols)) / cols} is an isolated hole`).toBe(1)
      }
    }
    expect(dead).toBeGreaterThan(0)
  })

  it('never overdraws charge — a dark turret rides but does not shoot', () => {
    // A spent turret is not removed where it ran dry; it carries on to the gate
    // (spec §4 rule 6). So charge 0 on a live turret is expected — NEGATIVE charge
    // would mean a dark turret was still destroying cells.
    const s = createState(cfg({ charge: 5, capacity: 3 }), SIZE)
    run(s, 30)
    for (const l of s.track) expect(l.charge).toBeGreaterThanOrEqual(0)
  })

  it('rotates a spent turret out at the gate, not where it ran dry', () => {
    const s = createState(cfg({ charge: 1, capacity: 1, speed: 120 }), SIZE)
    // Identity is the OBJECT, never a field value: a rotated turret is restored to
    // full charge, so `maxCharge === 1` would match the same turret again after it
    // came back round — and would also match anyone else the queue released.
    const t = {
      s: 10, band: s.field.idx[0], charge: 1, maxCharge: 1, laps: 0,
      edge: EDGE.top, lane: -1, armed: false, spent: false, hitThisLap: false, jitter: 0,
    }
    s.track.length = 0
    s.track.push(t)
    // Run only a fraction of a lap: it will spend its single charge almost at once,
    // then must still be riding — dark — because it has not reached the gate.
    run(s, 2)
    expect(s.track).toContain(t)
    expect(t.charge).toBe(0)
    expect(t.laps).toBe(0)
    // Now give it enough road to come back around; it must leave the track at the
    // gate — and, being permanent, turn up in the queue rather than vanishing.
    run(s, 60)
    expect(s.track).not.toContain(t)
    expect(s.queue).toContain(t)
    expect(t.charge).toBe(1)
  })

  it('ejects a turret that exceeds the lap cap without ever firing', () => {
    // Band 250 exists in no palette, so the scheduler could never draw it — the
    // anti-clog case has to be forced directly.
    const s = createState(cfg({ capacity: 1, lapCap: 1, speed: 600 }), SIZE)
    s.track.push({
      s: 0, band: 250, charge: 99, maxCharge: 99, laps: 0,
      edge: EDGE.top, lane: -1, armed: false, spent: false, hitThisLap: false, jitter: 0,
    })
    run(s, 30)
    expect(s.track.some((l) => l.band === 250)).toBe(false)
  })

  it('ejects a turret that finishes a lap without landing a shot', () => {
    // #280. Band 250 is in no palette, so this turret can never hit anything. It used
    // to hold its slot until the lap cap — measured up to 3 laps, ~90s at the default
    // speed — while a fresh arrival could have taken the slot and hit something.
    const s = createState(cfg({ capacity: 1, lapCap: 12, speed: 600 }), SIZE)
    s.track.push({
      s: 0, band: 250, charge: 99, maxCharge: 99, laps: 0,
      edge: EDGE.top, lane: -1, armed: false, spent: false, hitThisLap: false, jitter: 0,
    })
    // 3600px of travel over a 1496px perimeter — 2.4 laps, far short of the lap cap.
    run(s, 6)
    expect(s.track.some((l) => l.band === 250)).toBe(false)
  })

  it('ejects a turret that hit on its first lap but goes blank on a later one', () => {
    // The transition case, and the one that actually pins the per-lap RESET. Without
    // the reset the flag degrades from "hit this lap" to "hit ever", so one lucky
    // strike buys a ride all the way to the lap cap — exactly what #280 removes.
    const s = createState(cfg({ capacity: 1, lapCap: 12, speed: 600 }), SIZE)
    const hist = exposedHistogram(s.field, s.front, new Uint32Array(s.field.bands))
    let best = 0
    for (let b = 1; b < hist.length; b++) if (hist[b] > hist[best]) best = b
    s.track.push({
      s: 0, band: best, charge: 1e9, maxCharge: 1e9, laps: 0,
      edge: EDGE.top, lane: -1, armed: false, spent: false, hitThisLap: false, jitter: 0,
    })
    run(s, 6)
    const live = s.track.find((l) => l.maxCharge === 1e9)
    expect(live).toBeDefined()
    expect(live!.laps).toBeGreaterThanOrEqual(1)

    // Its colour goes extinct — but the PICTURE does not, so the empty-picture eject
    // path stays shut and only the blank-lap rule can remove it.
    for (let i = 0; i < s.field.idx.length; i++) {
      if (s.field.idx[i] === best && s.field.alive[i]) { s.field.alive[i] = 0; s.field.aliveCount-- }
    }
    expect(s.field.aliveCount).toBeGreaterThan(0)

    run(s, 12) // two more laps, still well under the lap cap of 12
    expect(s.track.some((l) => l.maxCharge === 1e9)).toBe(false)
  })

  it('keeps a turret that landed at least one shot on its lap', () => {
    // The mirror of the rule above: productive turrets must be untouched by it, or the
    // fleet empties itself every lap.
    const s = createState(cfg({ capacity: 1, lapCap: 12, speed: 600 }), SIZE)
    const hist = exposedHistogram(s.field, s.front, new Uint32Array(s.field.bands))
    let best = 0
    for (let b = 1; b < hist.length; b++) if (hist[b] > hist[best]) best = b
    s.track.push({
      s: 0, band: best, charge: 1e9, maxCharge: 1e9, laps: 0,
      edge: EDGE.top, lane: -1, armed: false, spent: false, hitThisLap: false, jitter: 0,
    })
    run(s, 6)
    const survivor = s.track.find((l) => l.maxCharge === 1e9)
    expect(survivor).toBeDefined()
    expect(survivor!.laps).toBeGreaterThanOrEqual(1)
  })

  it('still ejects at the lap cap a turret that keeps hitting', () => {
    // The no-hit rule leaves the lap cap load-bearing for exactly one case: a turret
    // that lands shots every lap and has charge to spare. Without the cap it rides
    // forever.
    //
    // The window has to stay INSIDE the productive laps or this proves nothing: the
    // band erodes away by lap 8, so a 20s run lets the blank-lap rule eject it at
    // t=19.9 and the assertion passes with the cap deleted. 6s is 2.4 laps, so at
    // lapCap 2 only the cap can have taken it.
    const s = createState(cfg({ capacity: 1, lapCap: 2, speed: 600 }), SIZE)
    const hist = exposedHistogram(s.field, s.front, new Uint32Array(s.field.bands))
    let best = 0
    for (let b = 1; b < hist.length; b++) if (hist[b] > hist[best]) best = b
    s.track.push({
      s: 0, band: best, charge: 1e9, maxCharge: 1e9, laps: 0,
      edge: EDGE.top, lane: -1, armed: false, spent: false, hitThisLap: false, jitter: 0,
    })
    const before = s.field.aliveCount
    run(s, 6)
    expect(s.track.some((l) => l.maxCharge === 1e9)).toBe(false)
    // ...and it was still landing strikes when the cap took it, so this is the cap
    // firing rather than the blank-lap rule.
    expect(s.field.aliveCount).toBeLessThan(before)
  })

  it('mints nothing while the picture is empty', () => {
    const s = createState(cfg({ fleet: 24, capacity: 10 }), SIZE)
    emptyThePicture(s)
    // keep one turret alive so the regeneration branch stays shut
    s.track.push({
      s: 0, band: 0, charge: 5, maxCharge: 5, laps: 0,
      edge: EDGE.top, lane: -1, armed: false, spent: false, hitThisLap: false, jitter: 0,
    })
    s.queue.length = 0
    for (let i = 0; i < 60; i++) step(s, 1 / 60)
    expect(s.queue.length).toBe(0)
    expect(s.track.length).toBeLessThanOrEqual(1)
  })

  it('regenerates a fresh picture once everything is gone', () => {
    const s = createState(cfg(), SIZE)
    const first = Array.from(s.field.idx)
    emptyThePicture(s)
    s.track.length = 0
    s.dying.length = 0
    step(s, 1 / 60)
    expect(s.field.aliveCount).toBe(s.field.cols * s.field.rows)
    expect(s.pictures).toBe(1)
    expect(Array.from(s.field.idx)).not.toEqual(first)
  })

  it('does not regenerate while turrets or dying cells remain', () => {
    const s = createState(cfg(), SIZE)
    emptyThePicture(s)
    s.dying.push({ cell: 0, col: 0, row: 0, band: 0, t: 0 })
    s.track.length = 0
    step(s, 1 / 60)
    expect(s.pictures).toBe(0)
  })

  it('is deterministic for a given seed', () => {
    const a = createState(cfg({ seed: 42 }), SIZE)
    const b = createState(cfg({ seed: 42 }), SIZE)
    run(a, 10)
    run(b, 10)
    expect(b.field.aliveCount).toBe(a.field.aliveCount)
    expect(b.track.map((l) => l.band)).toEqual(a.track.map((l) => l.band))
  })

  it('eventually consumes a picture entirely and starts the next', () => {
    const s = createState(cfg({ cellSize: 40, capacity: 20, fleet: 24, speed: 400 }), SIZE)
    run(s, 240)
    expect(s.pictures).toBeGreaterThanOrEqual(1)
  })

  it('fires at a rate proportional to speed, at every cell size', () => {
    // The schema help promises "one shot per cell of travel", i.e. rate = speed /
    // cellSize with no separate rate knob. A single long step per frame silently
    // drops every lane centre it flies over — measured 0 shots/sec at cell 2,
    // speed 600, where step length and lane pitch resonate. Sub-stepping fixes it;
    // this pins the promise.
    const measure = (cellSize: number, speed: number) => {
      const base = cfg({ cellSize, speed, capacity: 4, charge: 1e9 })
      const s = createState(base, { width: 1200, height: 800 })
      const hist = exposedHistogram(s.field, s.front, new Uint32Array(s.field.bands))
      let best = 0
      for (let b = 1; b < hist.length; b++) if (hist[b] > hist[best]) best = b
      s.track.push({
        s: 0, band: best, charge: 1e9, maxCharge: 1e9, laps: 0,
        edge: EDGE.top, lane: -1, armed: false, spent: false, hitThisLap: false, jitter: 0,
      })
      const before = s.field.aliveCount
      run(s, 10)
      return before - s.field.aliveCount
    }

    // the exact resonance that measured ZERO before sub-stepping
    expect(measure(2, 600)).toBeGreaterThan(100)
    // and the rate tracks speed rather than saturating at one shot per frame
    const slow = measure(2, 300)
    const fast = measure(2, 600)
    expect(fast).toBeGreaterThan(slow * 1.5)
    // 60fps caps an unfixed implementation at 600 shots/10s; cell 4 at speed 400
    // passes 1000 lanes in that window, so a healthy hit count must clear the cap
    // relative to lanes passed
    expect(measure(4, 400)).toBeGreaterThan(200)
  })

  it('spacing 1 spreads turrets at even intervals and keeps them there', () => {
    const capacity = 4
    const s = createState(cfg({ capacity, fleet: 24, spacing: 1, charge: 1e9 }), SIZE)
    // the formation BUILDS: the gate holds for perimeter/capacity of travel between
    // releases, so filling the track takes one full lap rather than one frame
    run(s, 30)
    expect(s.track.length).toBe(capacity)

    const gapsAreEven = () => {
      const pos = s.track.map((l) => l.s).sort((a, b) => a - b)
      const gaps = pos.map((p, i) => (i === 0 ? p + s.geom.perimeter - pos[pos.length - 1] : p - pos[i - 1]))
      const ideal = s.geom.perimeter / capacity
      return gaps.every((g) => Math.abs(g - ideal) < s.geom.cell * 2)
    }
    expect(gapsAreEven()).toBe(true)
    // they all move at the same speed, so the formation must survive travel
    run(s, 20)
    expect(gapsAreEven()).toBe(true)
  })

  it('two turrets at spacing 1 sit exactly opposite each other', () => {
    const s = createState(cfg({ capacity: 2, fleet: 24, spacing: 1, charge: 1e9 }), SIZE)
    run(s, 30)
    expect(s.track.length).toBe(2)
    const half = s.geom.perimeter / 2
    const apart = Math.abs(s.track[0].s - s.track[1].s)
    // within the deliberate sub-cell anti-welding jitter (up to one cell each)
    expect(Math.abs(Math.min(apart, s.geom.perimeter - apart) - half)).toBeLessThan(s.geom.cell * 2)
  })

  it('spacing 0 keeps them bunched near the gate', () => {
    const s = createState(cfg({ capacity: 6, fleet: 24, spacing: 0, charge: 1e9, speed: 60 }), SIZE)
    run(s, 1)
    expect(s.track.length).toBe(6)
    const spread = Math.max(...s.track.map((l) => l.s)) - Math.min(...s.track.map((l) => l.s))
    expect(spread).toBeLessThan(s.geom.perimeter / 4)
  })

  it('every turret enters at the gate, at every spacing', () => {
    // Spacing is a matter of RELEASE TIMING, never position. A turret placed part-way
    // round would pop into existence ahead of the pack instead of joining behind it.
    for (const spacing of [0, 0.3, 0.6, 1]) {
      const s = createState(cfg({ capacity: 6, fleet: 24, spacing, charge: 25 }), SIZE)
      const seen = new Set<object>()
      for (let i = 0; i < 60 * 90; i++) {
        step(s, 1 / 60)
        for (const l of s.track) {
          if (seen.has(l)) continue
          seen.add(l)
          // born within one cell of s = 0, the track's top-left corner
          expect(l.s, `spacing ${spacing}: entered at ${l.s.toFixed(0)}`).toBeLessThan(s.geom.cell * 2)
        }
      }
      expect(seen.size).toBeGreaterThan(6)
    }
  })

  it('never mints two turrets at an identical position', () => {
    // Identical `s` would weld them together for life — same lane, same centre
    // crossing, every frame — and they would double-strike each lane.
    for (const spacing of [0, 0.5, 1]) {
      const s = createState(cfg({ capacity: 12, fleet: 24, spacing, charge: 1e9 }), SIZE)
      run(s, 5)
      const pos = s.track.map((l) => l.s)
      expect(new Set(pos).size, `spacing ${spacing}`).toBe(pos.length)
    }
  })

  it('keeps the dying, bolt and patch lists bounded', () => {
    const s = createState(cfg({ capacity: 40, fleet: 24, speed: 500 }), SIZE)
    run(s, 60)
    expect(s.dying.length).toBeLessThan(4000)
    expect(s.bolts.length).toBeLessThan(4000)
  })

  it('records every kill as a buffer patch', () => {
    const s = createState(cfg({ capacity: 12, fleet: 24 }), SIZE)
    const before = s.field.aliveCount
    run(s, 10)
    expect(s.patches.length).toBe(before - s.field.aliveCount)
  })

  it('draws turret colours only from bands that were exposed', () => {
    const s = createState(cfg({ capacity: 20, fleet: 24 }), SIZE)
    run(s, 15)
    for (const l of s.track) {
      expect(l.band).toBeGreaterThanOrEqual(0)
      expect(l.band).toBeLessThan(s.field.bands)
    }
  })
})

describe('applyConfig', () => {
  it('applies visual changes live', () => {
    const s = createState(cfg(), SIZE)
    expect(applyConfig(s, cfg({ speed: 300 }), SIZE)).toBe(true)
    expect(s.cfg.speed).toBe(300)
    expect(applyConfig(s, cfg({ targetingBias: 2 }), SIZE)).toBe(true)
    expect(applyConfig(s, cfg({ background: '#123456' }), SIZE)).toBe(true)
  })

  it('treats the track offset as structural — it resizes the cell grid', () => {
    // The offset sets the margin, which sets how many cells fit. Applying it live
    // would leave geom describing a different grid than field holds, and every lane
    // past the new column count would read -1 forever — those outer rows and
    // columns would become immortal and the picture could never finish.
    const s = createState(cfg(), SIZE)
    expect(applyConfig(s, cfg({ trackOffset: 60 }), SIZE)).toBe(false)
  })

  it('invalidates the baked picture buffer on a recolour', () => {
    // Otherwise the map keeps the old palette while turrets and bolts switch to the
    // new one — the recorded baked-buffer/live-layers failure.
    const s = createState(cfg(), SIZE)
    s.buffer = {} as HTMLCanvasElement
    const recoloured = cfg().palette.map(() => '#123456')
    expect(applyConfig(s, cfg({ palette: recoloured }), SIZE)).toBe(true)
    expect(s.buffer).toBe(null)

    s.buffer = {} as HTMLCanvasElement
    expect(applyConfig(s, cfg({ palette: recoloured, background: '#221100' }), SIZE)).toBe(true)
    expect(s.buffer).toBe(null)
  })

  it('leaves the buffer alone when nothing about colour changed', () => {
    const s = createState(cfg(), SIZE)
    const kept = {} as HTMLCanvasElement
    s.buffer = kept
    expect(applyConfig(s, cfg({ speed: 400 }), SIZE)).toBe(true)
    expect(s.buffer).toBe(kept)
  })

  it('rejects structural changes so the framework re-runs setup', () => {
    for (const over of [{ cellSize: 30 }, { featureSize: 40 }, { roughness: 0.9 }, { seed: 77 }]) {
      const s = createState(cfg(), SIZE)
      expect(applyConfig(s, cfg(over), SIZE), JSON.stringify(over)).toBe(false)
    }
  })

  it('treats a palette LENGTH change as structural but a recolour as live', () => {
    const s = createState(cfg(), SIZE)
    expect(applyConfig(s, cfg({ palette: ['#000', '#fff'] }), SIZE)).toBe(false)
    const same = cfg().palette.map(() => '#123456')
    expect(applyConfig(s, cfg({ palette: same }), SIZE)).toBe(true)
  })
})

describe('resizeState', () => {
  it('rebuilds the grid and drops the cached buffer', () => {
    const s = createState(cfg(), SIZE)
    s.buffer = {} as HTMLCanvasElement
    resizeState(s, { width: 900, height: 500 })
    expect(s.buffer).toBe(null)
    expect(s.field.cols).toBe(s.geom.cols)
    expect(s.field.rows).toBe(s.geom.rows)
    expect(s.field.aliveCount).toBe(s.field.cols * s.field.rows)
  })
})

// ─── The circulating fleet (#283) ───────────────────────────────────────────

describe('the circulating fleet', () => {
  it('raises a fleet smaller than the number of colours', () => {
    // Correctness, not balance: a band with no turret tuned to it is never
    // destroyed, so the picture could never reach zero and the piece would hang.
    const s = createState(cfg({ fleet: 2, palette: ['#111111', '#333333', '#555555', '#777777'] }), SIZE)
    expect(s.queue.length).toBe(4)
  })

  it('gives every band at least one turret', () => {
    const c = cfg({ fleet: 8 })
    const s = createState(c, SIZE)
    const per = new Uint32Array(c.palette.length)
    for (const t of s.queue) per[t.band]++
    expect([...per].every((n) => n >= 1)).toBe(true)
  })

  it('allocates the crew in proportion to the whole picture', () => {
    // Quantization is by quantile, so the bands are near-equal in mass and at the
    // default bias of 1 the crew comes out near-equal too. The point being pinned is
    // that allocation reads the WHOLE picture, not the exposed front — which is a
    // far smaller and much lumpier sample (0.6%-10.2% of each band at t=0).
    const c = cfg({ fleet: 60 })
    const s = createState(c, SIZE)
    const per = new Uint32Array(c.palette.length)
    for (const t of s.queue) per[t.band]++
    const even = 60 / c.palette.length
    const worst = Math.max(...[...per].map((n) => Math.abs(n - even) / even))
    expect(worst).toBeLessThan(0.35)
  })

  it('interleaves colours in the queue rather than releasing one band first', () => {
    // Unshuffled, the gate sends out every turret of band 0 before any of band 1 and
    // the opening minutes of a picture are monochrome.
    const s = createState(cfg({ fleet: 24 }), SIZE)
    const firstSix = s.queue.slice(0, 6).map((t) => t.band)
    expect(new Set(firstSix).size).toBeGreaterThan(1)
  })

  it('holds the headcount invariant across a full picture', () => {
    const s = createState(cfg({ fleet: 20, capacity: 12, speed: 400, charge: 8, cellSize: 20 }), SIZE)
    const expected = s.track.length + s.queue.length + s.retired.length
    let worst = expected
    for (let i = 0; i < 60 * 400 && s.pictures === 0; i++) {
      step(s, 1 / 60)
      const n = s.track.length + s.queue.length + s.retired.length
      if (n !== expected) { worst = n; break }
    }
    expect(worst).toBe(expected)
  })

  it('keeps every queued turret at full charge', () => {
    const s = createState(cfg({ fleet: 20, capacity: 4, speed: 400, charge: 3, cellSize: 20 }), SIZE)
    run(s, 45)
    const bad = s.queue.filter((t) => t.charge !== 3).length
    expect(bad).toBe(0)
  })

  it('releases turrets only at the gate, never mid-track', () => {
    const s = createState(cfg({ fleet: 20, capacity: 12, speed: 300, cellSize: 20 }), SIZE)
    let worstEntry = 0
    for (let i = 0; i < 900; i++) {
      const before = new Set(s.track)
      step(s, 1 / 60)
      for (const t of s.track) if (!before.has(t)) worstEntry = Math.max(worstEntry, t.s)
    }
    // A turret that has just joined is within one frame's travel of s = 0, plus its
    // own sub-cell jitter. Anything further round means it was placed, not released.
    expect(worstEntry).toBeLessThan(s.geom.cell + 300 / 60)
  })

  /** Recounts alive cells per band straight from the field. An INDEPENDENT oracle:
   *  retirement is implemented as `bandAlive[band] === 0`, so a test that reads
   *  `bandAlive` re-reads the deciding variable and proves nothing. */
  const recount = (s: AblationState) => {
    const n = new Uint32Array(s.field.bands)
    for (let i = 0; i < s.field.idx.length; i++) if (s.field.alive[i]) n[s.field.idx[i]]++
    return n
  }

  it('keeps the incremental bandAlive equal to a recount of the field', () => {
    // `bandAlive` is maintained by decrementing on each kill rather than recounting.
    // Any kill path that forgets to decrement, or any rebuild that counts dead cells,
    // shows up here — including on a live re-crew.
    const s = createState(cfg({ fleet: 20, capacity: 12, speed: 500, charge: 40, cellSize: 20 }), SIZE)
    let bad = ''
    for (let i = 0; i < 60 * 300 && s.pictures === 0 && !bad; i++) {
      step(s, 1 / 60)
      if (i % 30 !== 0) continue
      const truth = recount(s)
      for (let b = 0; b < truth.length; b++) {
        if (truth[b] !== s.bandAlive[b]) { bad = `band ${b}: ${s.bandAlive[b]} != ${truth[b]}`; break }
      }
    }
    expect(bad).toBe('')
  })

  it('retires a turret only when its band is truly extinct in the field', () => {
    const s = createState(cfg({ fleet: 20, capacity: 12, speed: 500, charge: 40, cellSize: 20 }), SIZE)
    let bad = -1
    for (let i = 0; i < 60 * 400 && s.pictures === 0 && bad < 0; i++) {
      step(s, 1 / 60)
      if (s.retired.length === 0) continue
      const truth = recount(s)
      for (const t of s.retired) if (truth[t.band] !== 0) { bad = t.band; break }
    }
    expect(bad).toBe(-1)
  })

  it('actually retires turrets over a picture — the row is not dead code', () => {
    // The previous version of this suite asserted only that retirement was CORRECT
    // when it happened. Deleting the `bandAlive` decrement outright — which switches
    // retirement off entirely — left every test green.
    const s = createState(cfg({ fleet: 20, capacity: 12, speed: 500, charge: 40, cellSize: 20 }), SIZE)
    let peak = 0
    for (let i = 0; i < 60 * 400 && s.pictures === 0; i++) {
      step(s, 1 / 60)
      if (s.retired.length > peak) peak = s.retired.length
    }
    expect(peak).toBeGreaterThan(0)
  })

  it('keeps retiring after a live fleet edit mid-picture', () => {
    // `crew()` also runs from applyConfig. Rebuilding `bandAlive` from ALL cells
    // there resurrects extinct bands, so retirement silently stops for the rest of
    // the picture and turrets get allocated to colours that are already gone.
    const c = cfg({ fleet: 20, capacity: 12, speed: 500, charge: 40, cellSize: 20 })
    const s = createState(c, SIZE)
    for (let i = 0; i < 60 * 200 && s.pictures === 0; i++) {
      step(s, 1 / 60)
      if (recount(s).some((n) => n === 0)) break      // at least one band extinct
    }
    const truth = recount(s)
    expect(truth.some((n) => n === 0)).toBe(true)     // the setup actually happened
    expect(applyConfig(s, { ...c, fleet: 21 }, SIZE)).toBe(true)
    for (let b = 0; b < truth.length; b++) {
      if (truth[b] === 0) expect(s.bandAlive[b]).toBe(0)
    }
    // ...and no turret is now hunting a colour that no longer exists.
    for (const t of [...s.track, ...s.queue]) expect(truth[t.band]).toBeGreaterThan(0)
  })

  it('does not retire the whole Unison queue in one frame', () => {
    // In Unison every rotation stamps the same lockBand, so the queue is homogeneous;
    // an unguarded sweep retires all of it the frame that colour dies. Measured at
    // capacity 2: 18 of 20 turrets gone in a single frame with 13.6% still standing.
    let worst = 0
    // Sweep CAPACITY, not just seeds. Two separate defects produced this, and they
    // bite at different capacities — measured with each fix removed in turn:
    //   capacity 2  → only the stale-lock ordering matters (18 of 20 in one frame)
    //   capacity 12 → only the Mixed-only guard matters (8 in one frame, 4-13% left)
    //   capacity 14 → only the Mixed-only guard matters (6 in one frame) — and 14 is
    //                 the shipped `Strip Mine` preset, so this is a real regime.
    // A single-capacity test passes against a half-fixed build.
    for (const [capacity, seed] of [[2, 2], [12, 1], [12, 3], [14, 2]] as const) {
      const s = createState(cfg({
        targeting: 'Unison', seed, fleet: 20, capacity, speed: 600, cellSize: 12, charge: 60,
      }), { width: 1200, height: 800 })
      for (let i = 0; i < 60 * 600 && s.pictures === 0; i++) {
        const before = s.retired.length
        step(s, 1 / 60)
        // Ignore the very end, where everything legitimately retires together.
        if (s.field.aliveCount === 0) break
        worst = Math.max(worst, s.retired.length - before)
      }
    }
    expect(worst).toBeLessThan(5)
  })

  it('reaches zero cells with the fleet clamped to one turret per band', () => {
    const s = createState(cfg({ fleet: 2, capacity: 8, speed: 600, charge: 200, cellSize: 24 }), SIZE)
    for (let i = 0; i < 60 * 900 && s.field.aliveCount > 0; i++) step(s, 1 / 60)
    expect(s.field.aliveCount).toBe(0)
  })

  it('re-crews the whole fleet for the next picture', () => {
    const s = createState(cfg({ fleet: 14, capacity: 8, speed: 600, charge: 200, cellSize: 24 }), SIZE)
    for (let i = 0; i < 60 * 900 && s.pictures === 0; i++) step(s, 1 / 60)
    expect(s.pictures).toBe(1)
    expect(s.retired.length).toBe(0)
    expect(s.track.length + s.queue.length).toBe(14)
  })
})

// ─── Unison targeting (#282) ────────────────────────────────────────────────

describe('unison targeting', () => {
  const uni = (over: Partial<AblationConfig> = {}) =>
    cfg({ targeting: 'Unison', fleet: 20, capacity: 12, cellSize: 20, ...over })

  it('locks onto a band that is actually exposed', () => {
    const s = createState(uni(), SIZE)
    run(s, 2)
    expect(s.lockBand).toBeGreaterThanOrEqual(0)
    expect(s.hist[s.lockBand]).toBeGreaterThan(0)
  })

  it('stays at -1 in Mixed mode', () => {
    const s = createState(cfg({ targeting: 'Mixed' }), SIZE)
    run(s, 5)
    expect(s.lockBand).toBe(-1)
  })

  it('holds the lock while the band is still on the exposed front', () => {
    const s = createState(uni({ speed: 200 }), SIZE)
    run(s, 2)
    const held = s.lockBand
    let drifted = false
    for (let i = 0; i < 60 * 30; i++) {
      step(s, 1 / 60)
      if (s.hist[held] === 0) break
      if (s.lockBand !== held) { drifted = true; break }
    }
    expect(drifted).toBe(false)
  })

  it('releases the lock once the band leaves the exposed front', () => {
    const s = createState(uni({ speed: 500, charge: 30 }), SIZE)
    run(s, 2)
    let changes = 0
    let prev = s.lockBand
    for (let i = 0; i < 60 * 300 && s.pictures === 0; i++) {
      step(s, 1 / 60)
      if (s.lockBand !== prev) { changes++; prev = s.lockBand }
    }
    expect(changes).toBeGreaterThan(0)
  })

  it('recolours a turret only at the gate, never mid-lap', () => {
    // The lag is the mode's visible signature: a switch shows up as a new colour
    // entering the QUEUE while the track is still working the old one.
    //
    // NB a turret CAN change colour and still be on the track one frame later — late
    // in a picture the queue has drained into `retired`, so a turret rotating out at
    // the gate finds its own slot free and re-enters immediately. That is a rotation
    // that completed inside one frame, not a mid-ride repaint, and the thing worth
    // pinning is therefore WHERE the colour changed: a recoloured turret must have
    // just been reset, i.e. sitting at the gate on lap zero.
    const c = uni({ speed: 500, charge: 6 })
    const s = createState(c, SIZE)
    run(s, 2)
    let midLapRecolour = 0
    for (let i = 0; i < 60 * 120 && s.pictures === 0 && midLapRecolour === 0; i++) {
      const before = s.track.map((t) => ({ t, band: t.band }))
      step(s, 1 / 60)
      for (const { t, band } of before) {
        if (!s.track.includes(t) || t.band === band) continue
        const atGate = t.laps === 0 && t.s < s.geom.cell + c.speed / 60
        if (!atGate) midLapRecolour++
      }
    }
    expect(midLapRecolour).toBe(0)
  })

  it('still consumes a picture entirely', () => {
    const s = createState(uni({ speed: 600, charge: 200, cellSize: 24 }), SIZE)
    for (let i = 0; i < 60 * 900 && s.field.aliveCount > 0; i++) step(s, 1 / 60)
    expect(s.field.aliveCount).toBe(0)
  })
})

// ─── Even spacing under churn (#281) ────────────────────────────────────────

describe('even spacing (#281)', () => {
  it('keeps the crew evenly spread across a full picture of rotations', () => {
    // The shipped comment claims the spread SURVIVES churn — that a replacement
    // enters the same distance behind the one in front. That only holds because
    // every rotation coincides with a gate crossing, and nothing measured it.
    const capacity = 12
    const s = createState(cfg({
      spacing: 1, fleet: 24, capacity, speed: 400, charge: 10, cellSize: 20,
    }), SIZE)
    for (let i = 0; i < 60 * 400 && s.track.length < capacity; i++) step(s, 1 / 60)
    expect(s.track.length).toBe(capacity)

    const even = s.geom.perimeter / capacity
    let worst = 0
    let rotations = 0
    let seen = new Set(s.track)
    for (let i = 0; i < 60 * 300 && s.pictures === 0; i++) {
      step(s, 1 / 60)
      for (const t of s.track) if (!seen.has(t)) rotations++
      seen = new Set(s.track)
      if (s.track.length < capacity) continue
      const at = s.track.map((t) => t.s).sort((a, b) => a - b)
      for (let j = 0; j < at.length; j++) {
        const gap = j === 0 ? at[0] + s.geom.perimeter - at[at.length - 1] : at[j] - at[j - 1]
        const off = Math.abs(gap - even) / even
        if (off > worst) worst = off
      }
    }
    expect(rotations).toBeGreaterThan(10)
    expect(worst).toBeLessThan(0.35)
  })
})

// ─── Unison starts locked, not proportional ─────────────────────────────────

describe('unison at picture start', () => {
  const uniCfg = (over: Partial<AblationConfig> = {}) =>
    cfg({ targeting: 'Unison', fleet: 24, capacity: 12, ...over })

  it('crews the ENTIRE fleet onto one exposed band before anything has run', () => {
    // Not "after a while". The lock is otherwise applied only on rotation, so a
    // freshly crewed picture wore the proportional Mixed split and converged only as
    // turrets cycled — at Track speed 2 a lap is ~25 minutes, so Unison looked
    // identical to Mixed indefinitely. Reported from the config screen.
    const s = createState(uniCfg(), SIZE)
    expect(s.queue.length).toBe(24)
    expect(new Set(s.queue.map((t) => t.band)).size).toBe(1)
    expect(s.lockBand).toBe(s.queue[0].band)
    // ...and the band it picked is actually on the surface.
    const hist = exposedHistogram(s.field, s.front, new Uint32Array(s.field.bands))
    expect(hist[s.lockBand]).toBeGreaterThan(0)
  })

  it('holds that single colour at the slowest track speed, where nothing rotates', () => {
    const s = createState(uniCfg({ speed: 2 }), SIZE)
    run(s, 30)
    expect(new Set([...s.track, ...s.queue].map((t) => t.band)).size).toBe(1)
  })

  it('re-locks the whole fleet for each new picture', () => {
    const s = createState(uniCfg({ speed: 600, charge: 200, cellSize: 24 }), SIZE)
    for (let i = 0; i < 60 * 900 && s.pictures === 0; i++) step(s, 1 / 60)
    expect(s.pictures).toBe(1)
    expect(new Set(s.queue.map((t) => t.band)).size).toBe(1)
  })

  it('leaves Mixed crewed proportionally, across several bands', () => {
    const s = createState(cfg({ targeting: 'Mixed', fleet: 24, capacity: 12 }), SIZE)
    expect(new Set(s.queue.map((t) => t.band)).size).toBeGreaterThan(1)
  })

  it('re-locks on a live switch from Mixed to Unison', () => {
    const c = cfg({ targeting: 'Mixed', fleet: 24, capacity: 12 })
    const s = createState(c, SIZE)
    run(s, 5)
    expect(applyConfig(s, { ...c, targeting: 'Unison' }, SIZE)).toBe(true)
    expect(new Set([...s.track, ...s.queue].map((t) => t.band)).size).toBe(1)
  })
})
