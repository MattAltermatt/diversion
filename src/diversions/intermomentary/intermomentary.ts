import { mulberry32 } from '../../framework/rng'
import type { IntermomentaryConfig } from './schema'

// The breathing pulse period (ms). Fixed and slow — the pulse amount is the knob;
// the rate is a calm constant so nothing strobes.
const PULSE_PERIOD = 16000

export interface Ring {
  phase: number // accumulated rotation, radians — driven by dt so a live speed edit doesn't jump
  phaseOffset: number // seed-stable starting angle
  dir: number // +1 / -1 spin direction (seed-stable)
  radiusFactor: number // fraction of ringRadius this ring sits at
  breathPhase: number // seed-stable phase offset into the pulse (so rings breathe out of sync)
}

export interface IMState {
  rings: Ring[]
  cfg: IntermomentaryConfig
  w: number
  h: number
  t: number // sim clock, ms (drives the breathing pulse)
}

/** A single circle in the current frame's arrangement. */
export interface Circle {
  x: number
  y: number
  r: number
  ring: number
  index: number // position around its ring (0..circleCount-1)
}

/** The fraction of ringRadius each ring sits at, outermost first. Concentric,
 *  evenly inset so the rings genuinely overlap and beat. Pure. */
export function ringRadiusFactors(ringCount: number): number[] {
  const factors: number[] = []
  for (let i = 0; i < ringCount; i++) factors.push(1 - 0.3 * i)
  return factors
}

function makeRings(cfg: IntermomentaryConfig): Ring[] {
  const rng = mulberry32(cfg.seed >>> 0)
  const factors = ringRadiusFactors(cfg.ringCount)
  const rings: Ring[] = []
  for (let i = 0; i < cfg.ringCount; i++) {
    rings.push({
      phase: 0,
      phaseOffset: rng() * Math.PI * 2,
      dir: rng() < 0.5 ? -1 : 1,
      radiusFactor: factors[i],
      breathPhase: rng() * Math.PI * 2,
    })
  }
  return rings
}

export function createIMState(cfg: IntermomentaryConfig, w: number, h: number): IMState {
  return { rings: makeRings(cfg), cfg, w, h, t: 0 }
}

/** Angular velocity of ring i: base rotationSpeed scaled up per ring by the
 *  differential, times its seed-stable direction. Pure. */
export function ringAngularVelocity(cfg: IntermomentaryConfig, ring: Ring, i: number): number {
  return cfg.rotationSpeed * (1 + i * cfg.differential) * ring.dir
}

/** The breathing scale of the ring radii at the current clock — a slow sine around
 *  1, amplitude = pulse. Per-ring breathPhase keeps rings out of sync. Pure. */
export function breathScale(cfg: IntermomentaryConfig, tMs: number, breathPhase: number): number {
  return 1 + cfg.pulse * Math.sin((tMs / PULSE_PERIOD) * Math.PI * 2 + breathPhase)
}

/** Advance the sim by dt ms: accumulate each ring's rotation and the pulse clock.
 *  The circle geometry itself is rebuilt each frame from these — the moire comes
 *  from the moving overlap, not from any baked buffer. */
export function stepIM(state: IMState, dt: number): void {
  state.t += dt
  const dts = dt / 1000
  state.rings.forEach((ring, i) => {
    ring.phase += ringAngularVelocity(state.cfg, ring, i) * dts
  })
}

/** Build every circle for the current frame: for each ring, `circleCount` equal
 *  circles with centers evenly spaced around a (breathing) concentric ring, rotated
 *  by the ring's accumulated phase. The single source of geometry for both the draw
 *  and the intersection highlight. Pure w.r.t. state. */
export function computeCircles(state: IMState): Circle[] {
  const { cfg, w, h } = state
  const cx = w / 2
  const cy = h / 2
  const n = cfg.circleCount
  const step = (Math.PI * 2) / n
  const circles: Circle[] = []
  state.rings.forEach((ring, i) => {
    const R = cfg.ringRadius * ring.radiusFactor * breathScale(cfg, state.t, ring.breathPhase)
    const base = ring.phaseOffset + ring.phase
    for (let j = 0; j < n; j++) {
      const a = base + j * step
      circles.push({
        x: cx + Math.cos(a) * R,
        y: cy + Math.sin(a) * R,
        r: cfg.circleRadius,
        ring: i,
        index: j,
      })
    }
  })
  return circles
}

/** The two intersection points of two circles, or [] if they don't cross (too far,
 *  nested, or coincident). Standard radical-line construction. Pure. */
export function circleIntersections(
  x0: number, y0: number, r0: number,
  x1: number, y1: number, r1: number,
): Array<[number, number]> {
  const dx = x1 - x0
  const dy = y1 - y0
  const d = Math.hypot(dx, dy)
  if (d > r0 + r1 || d < Math.abs(r0 - r1) || d === 0) return []
  const a = (r0 * r0 - r1 * r1 + d * d) / (2 * d)
  const h2 = r0 * r0 - a * a
  if (h2 < 0) return []
  const hh = Math.sqrt(h2)
  const xm = x0 + (a * dx) / d
  const ym = y0 + (a * dy) / d
  const ox = (hh * dy) / d
  const oy = (hh * dx) / d
  return [
    [xm + ox, ym - oy],
    [xm - ox, ym + oy],
  ]
}

/** The chord between two ADJACENT circle centers on a ring of the given radius —
 *  2*R*sin(pi/n). Adjacent circles overlap (and so intersect) exactly when this is
 *  less than 2*circleRadius. The headline invariant. Pure. */
export function adjacentChord(ringRadius: number, circleCount: number): number {
  return 2 * ringRadius * Math.sin(Math.PI / circleCount)
}

/** True when adjacent circles on the OUTER ring overlap at defaults — the condition
 *  for the intersection lattice to exist at all. Pure. */
export function adjacentCirclesOverlap(cfg: IntermomentaryConfig): boolean {
  const outerR = cfg.ringRadius * ringRadiusFactors(cfg.ringCount)[0]
  return adjacentChord(outerR, cfg.circleCount) < 2 * cfg.circleRadius
}

function strokeCircle(ctx: CanvasRenderingContext2D, c: Circle): void {
  ctx.beginPath()
  ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2)
  ctx.stroke()
}

/** Draw one frame: background, then every circle outline additively (so crossings
 *  brighten into light), optionally with a spark at each intersection point. Redrawn
 *  fresh each frame — the moire is the live overlap of the rotating, breathing rings. */
export function drawIM(state: IMState, ctx: CanvasRenderingContext2D): void {
  const { cfg, w, h } = state
  const dpr = ctx.canvas.width / w
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = cfg.color.background
  ctx.fillRect(0, 0, w, h)

  const circles = computeCircles(state)

  ctx.globalCompositeOperation = 'lighter'
  ctx.lineWidth = cfg.lineWidth

  if (cfg.color.mode === 'spectrum') {
    const n = cfg.circleCount
    for (const c of circles) {
      const hue = ((c.index / n) * 360 + c.ring * 40) % 360
      ctx.strokeStyle = `hsl(${hue}, ${cfg.color.saturation}%, 60%)`
      strokeCircle(ctx, c)
    }
  } else {
    for (const c of circles) {
      ctx.strokeStyle = c.ring % 2 === 0 ? cfg.color.inkA : cfg.color.inkB
      strokeCircle(ctx, c)
    }
  }

  if (cfg.highlightIntersections) {
    // Additive tiny sparks at every crossing — where two outlines cross, the lattice
    // reads as luminous nodes. O(circles^2) but circles is bounded (24*3) and each
    // spark is a cheap 2px rect.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
    for (let i = 0; i < circles.length; i++) {
      const a = circles[i]
      for (let j = i + 1; j < circles.length; j++) {
        const b = circles[j]
        const pts = circleIntersections(a.x, a.y, a.r, b.x, b.y, b.r)
        for (const [px, py] of pts) ctx.fillRect(px - 1, py - 1, 2, 2)
      }
    }
  }

  // Restore for the framework.
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
}

/** Live-apply a config change. A ring-count or seed change rebuilds the ring set,
 *  so returns false (framework re-runs setup); everything else applies live. */
export function updateIMState(state: IMState, cfg: IntermomentaryConfig, w: number, h: number): boolean {
  if (cfg.ringCount !== state.cfg.ringCount || cfg.seed !== state.cfg.seed) return false
  state.cfg = cfg
  state.w = w
  state.h = h
  return true
}

/** The arrangement is centered, so resize only needs the new dimensions. */
export function resizeIMState(state: IMState, w: number, h: number): void {
  state.w = w
  state.h = h
}
