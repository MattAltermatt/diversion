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
  it('starts with a full picture, no lasers and no queue', () => {
    const s = createState(cfg(), SIZE)
    expect(s.field.aliveCount).toBe(s.field.cols * s.field.rows)
    expect(s.lasers.length).toBe(0)
    expect(s.queue.length).toBe(0)
    expect(s.pictures).toBe(0)
  })

  it('sizes the band count to the palette length', () => {
    expect(createState(cfg({ palette: ['#000', '#fff'] }), SIZE).field.bands).toBe(2)
    expect(createState(cfg({ palette: ['#000', '#444', '#888', '#fff'] }), SIZE).field.bands).toBe(4)
  })
})

describe('step', () => {
  it('mints lasers up to capacity and queues the rest', () => {
    const s = createState(cfg({ capacity: 4, arrivalRate: 20 }), SIZE)
    run(s, 3)
    expect(s.lasers.length).toBe(4)
    expect(s.queue.length).toBeGreaterThan(0)
    expect(s.queue.length).toBeLessThanOrEqual(4)
  })

  it('destroys cells over time', () => {
    const s = createState(cfg(), SIZE)
    const before = s.field.aliveCount
    run(s, 20)
    expect(s.field.aliveCount).toBeLessThan(before)
  })

  it('only ever destroys a lane outermost cell — damage stays connected to the border', () => {
    // The load-bearing rule (spec §1): a laser cannot drill, so erosion is a
    // RECEDING SURFACE. A cell only ever dies as the outermost survivor of one of
    // its four lanes, which means everything between it and that edge is already
    // gone — so every dead cell must reach the border through dead cells. An
    // isolated interior hole would mean something struck through living material.
    //
    // NB this is a connectivity property, not a per-column one: left/right lasers
    // eat along ROWS, so a row eaten inward legitimately punches what looks like a
    // gap when you read a single column top to bottom.
    const s = createState(cfg({ capacity: 20, arrivalRate: 10 }), SIZE)
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

  it('never overdraws charge — a dark laser rides but does not shoot', () => {
    // A spent laser is not removed where it ran dry; it carries on to the gate
    // (spec §4 rule 6). So charge 0 on a live laser is expected — NEGATIVE charge
    // would mean a dark laser was still destroying cells.
    const s = createState(cfg({ charge: 5, capacity: 3 }), SIZE)
    run(s, 30)
    for (const l of s.lasers) expect(l.charge).toBeGreaterThanOrEqual(0)
  })

  it('ejects a spent laser at the gate, not where it ran dry', () => {
    const s = createState(cfg({ charge: 1, capacity: 1, arrivalRate: 0.001, speed: 120 }), SIZE)
    s.lasers.push({
      s: 10, band: s.field.idx[0], charge: 1, maxCharge: 1, laps: 0,
      edge: EDGE.top, lane: -1, armed: false, spent: false, hitThisLap: false,
    })
    // Run only a fraction of a lap: it will spend its single charge almost at once,
    // then must still be riding — dark — because it has not reached the gate.
    run(s, 2)
    expect(s.lasers.length).toBe(1)
    expect(s.lasers[0].charge).toBe(0)
    expect(s.lasers[0].laps).toBe(0)
    // Now give it enough road to come back around; it must leave at the gate.
    run(s, 60)
    expect(s.lasers.some((l) => l.maxCharge === 1)).toBe(false)
  })

  it('ejects a laser that exceeds the lap cap without ever firing', () => {
    // Band 250 exists in no palette, so the scheduler could never draw it — the
    // anti-clog case has to be forced directly.
    const s = createState(cfg({ capacity: 1, arrivalRate: 0.001, lapCap: 1, speed: 600 }), SIZE)
    s.lasers.push({
      s: 0, band: 250, charge: 99, maxCharge: 99, laps: 0,
      edge: EDGE.top, lane: -1, armed: false, spent: false, hitThisLap: false,
    })
    run(s, 30)
    expect(s.lasers.some((l) => l.band === 250)).toBe(false)
  })

  it('ejects a laser that finishes a lap without landing a shot', () => {
    // #280. Band 250 is in no palette, so this laser can never hit anything. It used
    // to hold its slot until the lap cap — measured up to 3 laps, ~90s at the default
    // speed — while a fresh arrival could have taken the slot and hit something.
    const s = createState(cfg({ capacity: 1, arrivalRate: 0.001, lapCap: 12, speed: 600 }), SIZE)
    s.lasers.push({
      s: 0, band: 250, charge: 99, maxCharge: 99, laps: 0,
      edge: EDGE.top, lane: -1, armed: false, spent: false, hitThisLap: false,
    })
    // 3600px of travel over a 1496px perimeter — 2.4 laps, far short of the lap cap.
    run(s, 6)
    expect(s.lasers.some((l) => l.band === 250)).toBe(false)
  })

  it('ejects a laser that hit on its first lap but goes blank on a later one', () => {
    // The transition case, and the one that actually pins the per-lap RESET. Without
    // the reset the flag degrades from "hit this lap" to "hit ever", so one lucky
    // strike buys a ride all the way to the lap cap — exactly what #280 removes.
    const s = createState(cfg({ capacity: 1, arrivalRate: 0.001, lapCap: 12, speed: 600 }), SIZE)
    const hist = exposedHistogram(s.field, s.front, new Uint32Array(s.field.bands))
    let best = 0
    for (let b = 1; b < hist.length; b++) if (hist[b] > hist[best]) best = b
    s.lasers.push({
      s: 0, band: best, charge: 1e9, maxCharge: 1e9, laps: 0,
      edge: EDGE.top, lane: -1, armed: false, spent: false, hitThisLap: false,
    })
    run(s, 6)
    const live = s.lasers.find((l) => l.maxCharge === 1e9)
    expect(live).toBeDefined()
    expect(live!.laps).toBeGreaterThanOrEqual(1)

    // Its colour goes extinct — but the PICTURE does not, so the empty-picture eject
    // path stays shut and only the blank-lap rule can remove it.
    for (let i = 0; i < s.field.idx.length; i++) {
      if (s.field.idx[i] === best && s.field.alive[i]) { s.field.alive[i] = 0; s.field.aliveCount-- }
    }
    expect(s.field.aliveCount).toBeGreaterThan(0)

    run(s, 12) // two more laps, still well under the lap cap of 12
    expect(s.lasers.some((l) => l.maxCharge === 1e9)).toBe(false)
  })

  it('keeps a laser that landed at least one shot on its lap', () => {
    // The mirror of the rule above: productive lasers must be untouched by it, or the
    // fleet empties itself every lap.
    const s = createState(cfg({ capacity: 1, arrivalRate: 0.001, lapCap: 12, speed: 600 }), SIZE)
    const hist = exposedHistogram(s.field, s.front, new Uint32Array(s.field.bands))
    let best = 0
    for (let b = 1; b < hist.length; b++) if (hist[b] > hist[best]) best = b
    s.lasers.push({
      s: 0, band: best, charge: 1e9, maxCharge: 1e9, laps: 0,
      edge: EDGE.top, lane: -1, armed: false, spent: false, hitThisLap: false,
    })
    run(s, 6)
    const survivor = s.lasers.find((l) => l.maxCharge === 1e9)
    expect(survivor).toBeDefined()
    expect(survivor!.laps).toBeGreaterThanOrEqual(1)
  })

  it('still ejects at the lap cap a laser that keeps hitting', () => {
    // The no-hit rule leaves the lap cap load-bearing for exactly one case: a laser
    // that lands shots every lap and has charge to spare. Without the cap it rides
    // forever.
    //
    // The window has to stay INSIDE the productive laps or this proves nothing: the
    // band erodes away by lap 8, so a 20s run lets the blank-lap rule eject it at
    // t=19.9 and the assertion passes with the cap deleted. 6s is 2.4 laps, so at
    // lapCap 2 only the cap can have taken it.
    const s = createState(cfg({ capacity: 1, arrivalRate: 0.001, lapCap: 2, speed: 600 }), SIZE)
    const hist = exposedHistogram(s.field, s.front, new Uint32Array(s.field.bands))
    let best = 0
    for (let b = 1; b < hist.length; b++) if (hist[b] > hist[best]) best = b
    s.lasers.push({
      s: 0, band: best, charge: 1e9, maxCharge: 1e9, laps: 0,
      edge: EDGE.top, lane: -1, armed: false, spent: false, hitThisLap: false,
    })
    const before = s.field.aliveCount
    run(s, 6)
    expect(s.lasers.some((l) => l.maxCharge === 1e9)).toBe(false)
    // ...and it was still landing strikes when the cap took it, so this is the cap
    // firing rather than the blank-lap rule.
    expect(s.field.aliveCount).toBeLessThan(before)
  })

  it('mints nothing while the picture is empty', () => {
    const s = createState(cfg({ arrivalRate: 20, capacity: 10 }), SIZE)
    emptyThePicture(s)
    // keep one laser alive so the regeneration branch stays shut
    s.lasers.push({
      s: 0, band: 0, charge: 5, maxCharge: 5, laps: 0,
      edge: EDGE.top, lane: -1, armed: false, spent: false, hitThisLap: false,
    })
    s.queue.length = 0
    for (let i = 0; i < 60; i++) step(s, 1 / 60)
    expect(s.queue.length).toBe(0)
    expect(s.lasers.length).toBeLessThanOrEqual(1)
  })

  it('regenerates a fresh picture once everything is gone', () => {
    const s = createState(cfg(), SIZE)
    const first = Array.from(s.field.idx)
    emptyThePicture(s)
    s.lasers.length = 0
    s.dying.length = 0
    step(s, 1 / 60)
    expect(s.field.aliveCount).toBe(s.field.cols * s.field.rows)
    expect(s.pictures).toBe(1)
    expect(Array.from(s.field.idx)).not.toEqual(first)
  })

  it('does not regenerate while lasers or dying cells remain', () => {
    const s = createState(cfg(), SIZE)
    emptyThePicture(s)
    s.dying.push({ cell: 0, col: 0, row: 0, band: 0, t: 0 })
    s.lasers.length = 0
    step(s, 1 / 60)
    expect(s.pictures).toBe(0)
  })

  it('is deterministic for a given seed', () => {
    const a = createState(cfg({ seed: 42 }), SIZE)
    const b = createState(cfg({ seed: 42 }), SIZE)
    run(a, 10)
    run(b, 10)
    expect(b.field.aliveCount).toBe(a.field.aliveCount)
    expect(b.lasers.map((l) => l.band)).toEqual(a.lasers.map((l) => l.band))
  })

  it('eventually consumes a picture entirely and starts the next', () => {
    const s = createState(cfg({ cellSize: 40, capacity: 20, arrivalRate: 10, speed: 400 }), SIZE)
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
      const base = cfg({ cellSize, speed, capacity: 4, arrivalRate: 0.0001, charge: 1e9 })
      const s = createState(base, { width: 1200, height: 800 })
      const hist = exposedHistogram(s.field, s.front, new Uint32Array(s.field.bands))
      let best = 0
      for (let b = 1; b < hist.length; b++) if (hist[b] > hist[best]) best = b
      s.lasers.push({
        s: 0, band: best, charge: 1e9, maxCharge: 1e9, laps: 0,
        edge: EDGE.top, lane: -1, armed: false, spent: false, hitThisLap: false,
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

  it('spacing 1 spreads lasers at even intervals and keeps them there', () => {
    const capacity = 4
    const s = createState(cfg({ capacity, arrivalRate: 30, spacing: 1, charge: 1e9 }), SIZE)
    // the formation BUILDS: the gate holds for perimeter/capacity of travel between
    // releases, so filling the track takes one full lap rather than one frame
    run(s, 30)
    expect(s.lasers.length).toBe(capacity)

    const gapsAreEven = () => {
      const pos = s.lasers.map((l) => l.s).sort((a, b) => a - b)
      const gaps = pos.map((p, i) => (i === 0 ? p + s.geom.perimeter - pos[pos.length - 1] : p - pos[i - 1]))
      const ideal = s.geom.perimeter / capacity
      return gaps.every((g) => Math.abs(g - ideal) < s.geom.cell * 2)
    }
    expect(gapsAreEven()).toBe(true)
    // they all move at the same speed, so the formation must survive travel
    run(s, 20)
    expect(gapsAreEven()).toBe(true)
  })

  it('two lasers at spacing 1 sit exactly opposite each other', () => {
    const s = createState(cfg({ capacity: 2, arrivalRate: 30, spacing: 1, charge: 1e9 }), SIZE)
    run(s, 30)
    expect(s.lasers.length).toBe(2)
    const half = s.geom.perimeter / 2
    const apart = Math.abs(s.lasers[0].s - s.lasers[1].s)
    // within the deliberate sub-cell anti-welding jitter (up to one cell each)
    expect(Math.abs(Math.min(apart, s.geom.perimeter - apart) - half)).toBeLessThan(s.geom.cell * 2)
  })

  it('spacing 0 keeps them bunched near the gate', () => {
    const s = createState(cfg({ capacity: 6, arrivalRate: 30, spacing: 0, charge: 1e9, speed: 60 }), SIZE)
    run(s, 1)
    expect(s.lasers.length).toBe(6)
    const spread = Math.max(...s.lasers.map((l) => l.s)) - Math.min(...s.lasers.map((l) => l.s))
    expect(spread).toBeLessThan(s.geom.perimeter / 4)
  })

  it('every laser enters at the gate, at every spacing', () => {
    // Spacing is a matter of RELEASE TIMING, never position. A laser placed part-way
    // round would pop into existence ahead of the pack instead of joining behind it.
    for (const spacing of [0, 0.3, 0.6, 1]) {
      const s = createState(cfg({ capacity: 6, arrivalRate: 3, spacing, charge: 25 }), SIZE)
      const seen = new Set<object>()
      for (let i = 0; i < 60 * 90; i++) {
        step(s, 1 / 60)
        for (const l of s.lasers) {
          if (seen.has(l)) continue
          seen.add(l)
          // born within one cell of s = 0, the track's top-left corner
          expect(l.s, `spacing ${spacing}: entered at ${l.s.toFixed(0)}`).toBeLessThan(s.geom.cell * 2)
        }
      }
      expect(seen.size).toBeGreaterThan(6)
    }
  })

  it('never mints two lasers at an identical position', () => {
    // Identical `s` would weld them together for life — same lane, same centre
    // crossing, every frame — and they would double-strike each lane.
    for (const spacing of [0, 0.5, 1]) {
      const s = createState(cfg({ capacity: 12, arrivalRate: 30, spacing, charge: 1e9 }), SIZE)
      run(s, 5)
      const pos = s.lasers.map((l) => l.s)
      expect(new Set(pos).size, `spacing ${spacing}`).toBe(pos.length)
    }
  })

  it('keeps the dying, bolt and patch lists bounded', () => {
    const s = createState(cfg({ capacity: 40, arrivalRate: 20, speed: 500 }), SIZE)
    run(s, 60)
    expect(s.dying.length).toBeLessThan(4000)
    expect(s.bolts.length).toBeLessThan(4000)
  })

  it('records every kill as a buffer patch', () => {
    const s = createState(cfg({ capacity: 12, arrivalRate: 8 }), SIZE)
    const before = s.field.aliveCount
    run(s, 10)
    expect(s.patches.length).toBe(before - s.field.aliveCount)
  })

  it('draws laser colours only from bands that were exposed', () => {
    const s = createState(cfg({ capacity: 20, arrivalRate: 10 }), SIZE)
    run(s, 15)
    for (const l of s.lasers) {
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
    // Otherwise the map keeps the old palette while lasers and bolts switch to the
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
