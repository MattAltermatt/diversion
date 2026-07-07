import { mulberry32 } from '../../framework/rng'
import { parseHex6, mix, rgba, type RGB } from '../../framework/color'
import type { SwirlingMagicConfig } from './schema'

// Swirling Magic — an After Dark homage. One shared pipeline (fade-trail
// persistence buffer + N-fold dihedral kaleidoscope + core+halo additive glow +
// cyclic palette) fed by two generators:
//   • Vortex — ribbons advected through a shearing whirl; their fading trails
//     braid and unwind (the gallery-grade flowing look).
//   • Web — a morphing harmonograph line-web mirrored into a star mandala (the
//     faithful After Dark "Rose" reconstruction).
// Everything is driven by absolute time t so motion is frame-rate independent,
// and three incommensurate periods (spin / breathe / hue-drift) keep it from
// ever visibly repeating.

const LUT_N = 256
const BINS = 48 // colour bins — caps stroke calls regardless of web density
const OMEGA_BASE = 0.16 // ribbon angular speed (rad/s) before shear
const RADIUS_FRAC = 0.46 // pattern radius as fraction of min(cssW, cssH)
const HIST_LEN = 220 // points of ribbon history redrawn each frame (the ribbon body)

// A ribbon carries a ring buffer of its recent head positions; the whole polyline
// is redrawn (bright) every frame, so the ribbon body stays saturated instead of
// decaying to a grey persistence-buffer ghost.
type Ribbon = {
  theta: number; r: number; dir: number; psi: number; period: number
  hx: number[]; hy: number[]; n: number
}

export type SwirlState = {
  cfg: SwirlingMagicConfig
  w: number
  h: number
  cx: number
  cy: number
  R: number
  t: number
  ribbons: Ribbon[]
  lut: RGB[] // LUT_N cyclic colour ramp
  binRGB: RGB[] // BINS precomputed colours
  bg: RGB
  needClear: boolean
}

/** Build a cyclic LUT_N ramp from the palette stops (wraps last → first). */
function buildLUT(stops: string[]): RGB[] {
  const cols = stops.map(parseHex6)
  const lut: RGB[] = new Array(LUT_N)
  const n = cols.length
  for (let k = 0; k < LUT_N; k++) {
    const f = (k / LUT_N) * n // cyclic: segment n-1 wraps to 0
    const idx = Math.floor(f) % n
    const t = f - Math.floor(f)
    lut[k] = mix(cols[idx], cols[(idx + 1) % n], t)
  }
  return lut
}

function makeBinRGB(lut: RGB[]): RGB[] {
  const out: RGB[] = new Array(BINS)
  for (let b = 0; b < BINS; b++) out[b] = lut[Math.floor(((b + 0.5) / BINS) * LUT_N) % LUT_N]
  return out
}

export function applyColors(st: SwirlState): void {
  st.lut = buildLUT(st.cfg.palette)
  st.binRGB = makeBinRGB(st.lut)
  st.bg = parseHex6(st.cfg.background)
}

function seedRibbons(cfg: SwirlingMagicConfig): Ribbon[] {
  const rng = mulberry32(cfg.seed >>> 0)
  const m = cfg.ribbons
  const ribbons: Ribbon[] = []
  for (let i = 0; i < m; i++) {
    ribbons.push({
      theta: (2 * Math.PI * i) / m + rng() * 0.5,
      r: 0.4 + rng() * 0.3,
      dir: i % 2 === 0 ? 1 : -1,
      psi: rng() * Math.PI * 2,
      period: cfg.breathe * (0.7 + rng() * 0.6),
      hx: new Array(HIST_LEN).fill(0), hy: new Array(HIST_LEN).fill(0), n: 0,
    })
  }
  return ribbons
}

export function createSwirlState(cfg: SwirlingMagicConfig, w: number, h: number): SwirlState {
  const lut = buildLUT(cfg.palette)
  return {
    cfg, w, h, cx: w / 2, cy: h / 2, R: RADIUS_FRAC * Math.min(w, h),
    t: 0,
    ribbons: seedRibbons(cfg),
    lut, binRGB: makeBinRGB(lut),
    bg: parseHex6(cfg.background),
    needClear: true,
  }
}

export function resizeSwirl(st: SwirlState, w: number, h: number): void {
  st.w = w
  st.h = h
  st.cx = w / 2
  st.cy = h / 2
  st.R = RADIUS_FRAC * Math.min(w, h)
  st.needClear = true // repaint the ground; the trail buffer rebuilds in ~1s
}

// A frame's line segments in centered coords, pre-binned by colour so the
// kaleidoscope replicates cheaply. Each bin is a flat [x0,y0,x1,y1,…] list — we
// replay it into ctx paths per copy (NOT Path2D: path coords bake at the CTM in
// effect when built, so a single Path2D can't be re-stroked under N different
// symmetry transforms — and Path2D is absent in the jsdom smoke sweep).
type Segments = { bins: (number[] | null)[] }

function newSegments(): Segments {
  return { bins: new Array(BINS).fill(null) }
}
function addSeg(seg: Segments, u: number, x0: number, y0: number, x1: number, y1: number): void {
  let b = Math.floor((u - Math.floor(u)) * BINS)
  if (b < 0) b = 0
  else if (b >= BINS) b = BINS - 1
  let arr = seg.bins[b]
  if (!arr) { arr = []; seg.bins[b] = arr }
  arr.push(x0, y0, x1, y1)
}

/** Advance each vortex ribbon, then emit its whole recent-history polyline so the
 *  ribbon body is redrawn bright every frame (single colour = its head hue). */
function stepVortex(st: SwirlState, dt: number): Segments {
  const { cfg, R, t } = st
  const seg = newSegments()
  const cycles = cfg.colorCycles
  for (const rb of st.ribbons) {
    const omega = OMEGA_BASE * (1 + cfg.swirl * (1 - rb.r))
    rb.theta += rb.dir * omega * dt
    const rTarget = 0.55 + 0.35 * Math.sin((2 * Math.PI * t) / rb.period + rb.psi)
    rb.r += (rTarget - rb.r) * Math.min(1, 0.5 * dt)
    const rDraw = rb.r + 0.03 * Math.sin(8 * rb.theta + t)
    // push the new head into the ring buffer
    const idx = rb.n % HIST_LEN
    rb.hx[idx] = R * rDraw * Math.cos(rb.theta)
    rb.hy[idx] = R * rDraw * Math.sin(rb.theta)
    rb.n++
    const u = rb.theta / (2 * Math.PI) * cycles + rb.r * 0.15 + t * cfg.hueDrift
    // emit the polyline oldest → newest (all one colour bin — the head hue)
    const start = rb.n > HIST_LEN ? rb.n - HIST_LEN : 0
    for (let s = start; s < rb.n - 1; s++) {
      const a = s % HIST_LEN, b = (s + 1) % HIST_LEN
      addSeg(seg, u, rb.hx[a], rb.hy[a], rb.hx[b], rb.hy[b])
    }
  }
  return seg
}

/** Compute the harmonograph line-web for this instant and emit its chords. */
function buildWeb(st: SwirlState): Segments {
  const { cfg, R, t } = st
  const seg = newSegments()
  const P = cfg.webPoints
  const step = cfg.weave % P
  const cycles = cfg.colorCycles
  const s1 = cfg.morph, s2 = cfg.morph * 0.62, s3 = cfg.morph * 0.38
  const a1 = 0.7, a2 = 0.28, a3 = 0.28
  const f1 = 1, f2 = 3, f3 = 2
  const d1 = ((cfg.seed >>> 0) % 1000) / 1000 * Math.PI * 2 // seeded phase
  const xs = new Float64Array(P)
  const ys = new Float64Array(P)
  for (let i = 0; i < P; i++) {
    const phi = (2 * Math.PI * i) / P
    xs[i] = R * (a1 * Math.sin(f1 * phi + s1 * t + d1) + a2 * Math.sin(f2 * phi - s2 * t))
    ys[i] = R * (a1 * Math.sin(f1 * phi + s1 * t + d1 + Math.PI / 2) + a3 * Math.sin(f3 * phi + s3 * t))
  }
  for (let i = 0; i < P; i++) {
    const j = (i + step) % P
    const u = (i / P) * cycles + t * cfg.hueDrift
    addSeg(seg, u, xs[i], ys[i], xs[j], ys[j])
  }
  return seg
}

/** Fade the persistence buffer, then draw this frame's segments kaleidoscope-
 *  replicated with a core+halo additive stroke. */
export function renderSwirl(st: SwirlState, ctx: CanvasRenderingContext2D, dt: number): void {
  const { cfg, w, h, cx, cy } = st
  st.t += dt

  // 1. Fade wash (or a hard clear after a resize / first frame).
  ctx.globalCompositeOperation = 'source-over'
  if (st.needClear) {
    ctx.fillStyle = rgba(st.bg, 1)
    ctx.fillRect(0, 0, w, h)
    st.needClear = false
  } else {
    ctx.fillStyle = rgba(st.bg, cfg.trailLength)
    ctx.fillRect(0, 0, w, h)
  }

  // 2. Generate this frame's segments (centered coords).
  const seg = cfg.generator === 'Vortex' ? stepVortex(st, dt) : buildWeb(st)

  // 3. Kaleidoscope-replicate. Two-layer stroke: a WIDE additive halo (bloom,
  //    kept dim so overlaps glow instead of clipping to white) UNDER a NARROW
  //    OPAQUE core (source-over) that holds saturated hue even where many
  //    symmetry copies cross — additive cores would blow dense webs to white and
  //    decay sparse ribbons to grey.
  const N = cfg.symmetry
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(cfg.spin * st.t)
  for (let k = 0; k < N; k++) {
    for (let pass = 0; pass < (cfg.mirror ? 2 : 1); pass++) {
      ctx.save()
      ctx.rotate((k * 2 * Math.PI) / N)
      if (pass === 1) ctx.scale(1, -1)
      for (let b = 0; b < BINS; b++) {
        const arr = seg.bins[b]
        if (!arr) continue
        const col = st.binRGB[b]
        ctx.beginPath()
        for (let s = 0; s < arr.length; s += 4) {
          ctx.moveTo(arr[s], arr[s + 1])
          ctx.lineTo(arr[s + 2], arr[s + 3])
        }
        ctx.globalCompositeOperation = 'lighter' // halo — wide, dim, additive
        ctx.strokeStyle = rgba(col, cfg.glow)
        ctx.lineWidth = cfg.glowWidth
        ctx.stroke()
        ctx.globalCompositeOperation = 'source-over' // core — narrow, opaque
        ctx.strokeStyle = rgba(col, 1)
        ctx.lineWidth = cfg.lineWidth
        ctx.stroke()
      }
      ctx.restore()
    }
  }
  ctx.restore()
  ctx.globalCompositeOperation = 'source-over'
}
