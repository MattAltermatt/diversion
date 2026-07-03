// camouflage.ts — a crypsis arms race. Pure and headless-testable. Moths with
// evolvable colours flutter over a baked mottled background; a predator repeatedly
// takes the most conspicuous moth (contrast against its local background), and the
// best-hidden survivors breed with colour mutation. The predator's "eye" sharpens
// as the population blends in. Deterministic given the seeded rng. The background is
// baked once at a fixed resolution and stretched to fill (resize never rebuilds it).

import { mulberry32, makeNoise3D } from '../../framework/rng'
import type { CamouflageConfig } from './schema'

const BAKE_W = 480
const BAKE_H = 270
const DETECT_THRESHOLD = 0.16 // a strike lands only if maxVisibility × acuity clears this
const ACUITY_MIN = 0.6
const ACUITY_MAX = 9

// 3-stop background palettes (dark → mid → light), one per habitat.
const THEMES: Record<CamouflageConfig['background'], [string, string, string]> = {
  lichen: ['#26331f', '#647a52', '#b7c39a'],
  bark: ['#241708', '#5a3b20', '#9c7c52'],
  seabed: ['#0a2830', '#2f6a64', '#c9bd8e'],
  night: ['#080810', '#26264a', '#5a5c78'],
  autumn: ['#241206', '#7c3512', '#e0a028'],
}

export interface Moth {
  x: number // normalized 0..1
  y: number
  dir: number // flutter heading
  r: number // colour 0..255
  g: number
  b: number
}

export interface Strike { x: number; y: number; ttl: number }

export interface CamouflageState {
  cfg: CamouflageConfig
  w: number
  h: number
  moths: Moth[]
  noise: (x: number, y: number, z: number) => number
  lut: Uint8Array // 256×3 background palette ramp
  rng: () => number
  acuity: number // predator eye sharpness (evolves)
  strikeAccum: number
  meanVis: number
  strikes: Strike[]
  bg: OffscreenCanvas | HTMLCanvasElement | null
  bgReady: boolean
}

// ── colour ──────────────────────────────────────────────────────────────────

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const mix = (a: number, b: number, t: number) => a + (b - a) * t

function buildLut(theme: [string, string, string]): Uint8Array {
  const [lo, mid, hi] = theme.map(hexRgb)
  const lut = new Uint8Array(256 * 3)
  for (let i = 0; i < 256; i++) {
    const t = i / 255
    let r, g, b
    if (t < 0.5) { const u = t / 0.5; r = mix(lo[0], mid[0], u); g = mix(lo[1], mid[1], u); b = mix(lo[2], mid[2], u) }
    else { const u = (t - 0.5) / 0.5; r = mix(mid[0], hi[0], u); g = mix(mid[1], hi[1], u); b = mix(mid[2], hi[2], u) }
    lut[i * 3] = r | 0; lut[i * 3 + 1] = g | 0; lut[i * 3 + 2] = b | 0
  }
  return lut
}

/** Background value at a normalized point (two octaves of value noise → 0..1). */
function bgValue(state: CamouflageState, nx: number, ny: number): number {
  const s = state.cfg.patternScale
  const v = 0.62 * state.noise(nx * s, ny * s, 0) + 0.38 * state.noise(nx * s * 2.4, ny * s * 2.4, 5.7)
  let t = 0.5 + 0.62 * v
  if (t < 0) t = 0; else if (t > 1) t = 1
  return t
}

export function bgColorAt(state: CamouflageState, nx: number, ny: number): [number, number, number] {
  const i = (bgValue(state, nx, ny) * 255) | 0
  const o = i * 3
  return [state.lut[o], state.lut[o + 1], state.lut[o + 2]]
}

/** Perceptual-ish contrast of a moth against its local background, in 0..1. */
export function visibility(state: CamouflageState, m: Moth): number {
  const [br, bg, bb] = bgColorAt(state, m.x, m.y)
  const dr = m.r - br, dg = m.g - bg, db = m.b - bb
  return Math.sqrt(0.3 * dr * dr + 0.59 * dg * dg + 0.11 * db * db) / 255
}

// ── build ──────────────────────────────────────────────────────────────────

export function createCamouflageState(cfg: CamouflageConfig, w: number, h: number): CamouflageState {
  const rng = mulberry32(cfg.seed | 0)
  const state: CamouflageState = {
    cfg, w, h, moths: [],
    noise: makeNoise3D(cfg.seed | 0),
    lut: buildLut(THEMES[cfg.background]),
    rng, acuity: 1, strikeAccum: 0, meanVis: 0, strikes: [],
    bg: null, bgReady: false,
  }
  // Moths start with random colours → most stand out, then evolution hides them.
  for (let i = 0; i < cfg.mothCount; i++) {
    state.moths.push({
      x: rng(), y: rng(), dir: rng() * Math.PI * 2,
      r: (rng() * 256) | 0, g: (rng() * 256) | 0, b: (rng() * 256) | 0,
    })
  }
  return state
}

// ── simulation ──────────────────────────────────────────────────────────────

const clampByte = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v)

/** Pick a well-hidden parent (tournament: lower visibility wins) and return a mutated
 *  offspring placed near the parent, so camouflage lineages localize to a region. */
function breedChild(state: CamouflageState): Moth {
  const { moths, rng } = state
  const a = moths[(rng() * moths.length) | 0]
  const b = moths[(rng() * moths.length) | 0]
  const parent = visibility(state, a) <= visibility(state, b) ? a : b
  const scale = state.cfg.mutationRate * 90
  const jitter = () => (rng() * 2 - 1) * scale
  const off = 0.04
  let x = parent.x + (rng() * 2 - 1) * off
  let y = parent.y + (rng() * 2 - 1) * off
  x = x < 0 ? 0 : x > 1 ? 1 : x
  y = y < 0 ? 0 : y > 1 ? 1 : y
  return {
    x, y, dir: rng() * Math.PI * 2,
    r: clampByte(parent.r + jitter()), g: clampByte(parent.g + jitter()), b: clampByte(parent.b + jitter()),
  }
}

/** One predator strike: take the most-conspicuous moth the (adapting) eye can see,
 *  replace it with a survivor's offspring. Returns true if a strike landed. */
function strike(state: CamouflageState): boolean {
  const { moths } = state
  let worst = -1, worstVis = 0
  for (let i = 0; i < moths.length; i++) {
    const v = visibility(state, moths[i])
    if (v > worstVis) { worstVis = v; worst = i }
  }
  if (worst < 0) return false
  // The eye must resolve it: visible enough × how sharp the predator has become.
  if (worstVis * state.acuity < DETECT_THRESHOLD) return false
  const m = moths[worst]
  if (state.cfg.showStrikes) state.strikes.push({ x: m.x, y: m.y, ttl: 0.5 })
  moths[worst] = breedChild(state)
  return true
}

export function advance(state: CamouflageState, dtMs: number): void {
  const dt = Math.min(dtMs, 100) / 1000 * state.cfg.simSpeed
  const { cfg, moths, rng } = state

  // Flutter: a gentle random walk, clamped to the frame.
  const speed = cfg.drift * 0.06
  if (speed > 0) {
    for (const m of moths) {
      m.dir += (rng() * 2 - 1) * 0.6
      m.x += Math.cos(m.dir) * speed * dt
      m.y += Math.sin(m.dir) * speed * dt
      if (m.x < 0) { m.x = 0; m.dir = Math.PI - m.dir }
      else if (m.x > 1) { m.x = 1; m.dir = Math.PI - m.dir }
      if (m.y < 0) { m.y = 0; m.dir = -m.dir }
      else if (m.y > 1) { m.y = 1; m.dir = -m.dir }
    }
  }

  // Predator strikes at the configured rate.
  state.strikeAccum += dt
  const interval = 1 / cfg.strikeRate
  let missed = false
  let budget = 40
  while (state.strikeAccum >= interval && budget-- > 0) {
    state.strikeAccum -= interval
    if (!strike(state)) missed = true
  }

  // The eye adapts: when strikes keep missing (the population has blended in), the
  // predator sharpens; otherwise it slowly relaxes. Scaled by the acuity-drive knob.
  const drive = cfg.acuityDrive
  if (drive > 0) {
    state.acuity += (missed ? 1 : -0.25) * drive * dt
    if (state.acuity < ACUITY_MIN) state.acuity = ACUITY_MIN
    else if (state.acuity > ACUITY_MAX) state.acuity = ACUITY_MAX
  }

  // Mean visibility (crypsis readout).
  let sum = 0
  for (const m of moths) sum += visibility(state, m)
  state.meanVis = moths.length ? sum / moths.length : 0

  for (const s of state.strikes) s.ttl -= dt
  if (state.strikes.length) state.strikes = state.strikes.filter((s) => s.ttl > 0)
}

// ── rendering ──────────────────────────────────────────────────────────────

function ensureBg(state: CamouflageState): void {
  if (state.bgReady) return
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(BAKE_W, BAKE_H)
    : (() => { const c = document.createElement('canvas'); c.width = BAKE_W; c.height = BAKE_H; return c })()
  const bctx = (canvas as OffscreenCanvas).getContext('2d') as OffscreenCanvasRenderingContext2D
  const img = bctx.createImageData(BAKE_W, BAKE_H)
  const d = img.data
  for (let y = 0; y < BAKE_H; y++) {
    for (let x = 0; x < BAKE_W; x++) {
      const [r, g, b] = bgColorAt(state, x / BAKE_W, y / BAKE_H)
      const p = (y * BAKE_W + x) * 4
      d[p] = r; d[p + 1] = g; d[p + 2] = b; d[p + 3] = 255
    }
  }
  bctx.putImageData(img, 0, 0)
  state.bg = canvas as OffscreenCanvas
  state.bgReady = true
}

export function render(state: CamouflageState, ctx: CanvasRenderingContext2D): void {
  ensureBg(state)
  const { w, h, cfg, moths } = state
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(state.bg as unknown as CanvasImageSource, 0, 0, BAKE_W, BAKE_H, 0, 0, w, h)

  const rad = cfg.mothSize
  for (const m of moths) {
    ctx.fillStyle = `rgb(${m.r | 0},${m.g | 0},${m.b | 0})`
    const cx = m.x * w, cy = m.y * h
    // A little moth: two wings (overlapping ellipses) so shape reads even when the
    // colour blends in.
    ctx.beginPath()
    ctx.ellipse(cx - rad * 0.5, cy, rad, rad * 0.7, -0.5, 0, Math.PI * 2)
    ctx.ellipse(cx + rad * 0.5, cy, rad, rad * 0.7, 0.5, 0, Math.PI * 2)
    ctx.fill()
  }

  if (cfg.showStrikes) {
    for (const s of state.strikes) {
      const a = Math.max(0, s.ttl / 0.5)
      ctx.strokeStyle = `rgba(255,255,255,${a * 0.85})`
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(s.x * w, s.y * h, (1 - a) * 22 + 5, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  if (cfg.showHud) {
    const hidden = Math.round((1 - Math.min(1, state.meanVis * 2.2)) * 100)
    ctx.globalAlpha = 0.9
    ctx.fillStyle = '#ffffff'
    ctx.font = '12px system-ui, sans-serif'
    ctx.textBaseline = 'top'
    ctx.fillText(`hidden ${hidden}%   ·   predator eye ${state.acuity.toFixed(1)}×`, 14, 14)
    ctx.globalAlpha = 1
  }
}
