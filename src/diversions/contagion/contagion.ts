import { mulberry32 } from '../../framework/rng'
import type { ContagionConfig } from './schema'

// Contagion — an SIR / SIRS epidemic on a toroidal lattice. Each cell is
// Susceptible, Infected, or Recovered. Per step an infected cell infects each
// susceptible neighbour with probability β; it stays infectious for a fixed
// duration then recovers; a recovered cell is immune for a while (SIRS) before
// becoming susceptible again — or immune forever (SIR, immunityDuration = 0).
//
// Past the transmission threshold a spark becomes a travelling wavefront. With
// waning immunity the fronts curl into endless spiral reinfection waves; with
// permanent immunity the epidemic burns through the field and dies out, and a
// fresh outbreak is seeded. Colour is driven by a single continuous "phase" ramp
// (rest → recovering tail → bright front) so the discrete automaton reads as a
// glowing liquid wave rather than flickering bands.

export const S = 0
export const I = 1
export const R = 2

const LUT_N = 256

type RGB = [number, number, number]

export type ContagionState = {
  cfg: ContagionConfig
  w: number
  h: number
  gw: number
  gh: number
  cell: number
  // double-buffered grids (read `state`, write `stateB`, then swap)
  state: Uint8Array
  stateB: Uint8Array
  timer: Uint16Array // steps remaining in the current I or R phase
  timerB: Uint16Array
  disp: Float32Array // phosphor-smoothed phase in 0..1, one per cell
  rng: () => number
  lut: Uint8Array // LUT_N × RGB, phase → colour
  // live compartment counts (fraction of the grid)
  counts: { s: number; i: number; r: number }
  history: Float32Array // ring buffer of infected fraction
  histLen: number
  histHead: number
  // offscreen blit target
  off: HTMLCanvasElement
  offCtx: CanvasRenderingContext2D
  img: ImageData
  stepAcc: number
}

function hexToRGB(hex: string): RGB {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

/** Build a LUT_N-entry colour ramp from the palette stops, shaped by contrast. */
function buildLUT(cfg: ContagionConfig): Uint8Array {
  const stops = cfg.palette.map(hexToRGB)
  const gamma = cfg.contrast
  const lut = new Uint8Array(LUT_N * 3)
  const segs = stops.length - 1
  for (let k = 0; k < LUT_N; k++) {
    const phase = k / (LUT_N - 1)
    const shaped = Math.pow(phase, gamma) // gamma > 1 thins the bright end
    const f = shaped * segs
    const idx = Math.min(segs - 1, Math.floor(f))
    const t = f - idx
    const a = stops[idx]
    const b = stops[idx + 1]
    lut[k * 3] = Math.round(a[0] + (b[0] - a[0]) * t)
    lut[k * 3 + 1] = Math.round(a[1] + (b[1] - a[1]) * t)
    lut[k * 3 + 2] = Math.round(a[2] + (b[2] - a[2]) * t)
  }
  return lut
}

export function applyColors(st: ContagionState): void {
  st.lut = buildLUT(st.cfg)
}

/** Map a cell's (state, timer) to a phase in 0..1 for the colour ramp.
 *  Rest S → 0; recovering R waning 0→0.5; infectious I 0.55→1 (freshest = peak). */
function phaseOf(state: number, timer: number, infDur: number, immDur: number): number {
  if (state === I) {
    // timer counts down infDur → 1; fresh infection is the bright leading edge
    return 0.55 + 0.45 * (timer / infDur)
  }
  if (state === R) {
    if (immDur <= 0) return 0.32 // permanent immunity: static "scar" tone
    return 0.5 * (timer / immDur) // waning immunity fades toward rest
  }
  return 0
}

/** Plant `seedCount` infected foci at random susceptible-ish cells. */
function seedFoci(st: ContagionState): void {
  const { state, timer, gw, gh, cfg, rng } = st
  const infDur = cfg.infectiousDuration
  for (let k = 0; k < cfg.seedCount; k++) {
    const x = Math.floor(rng() * gw)
    const y = Math.floor(rng() * gh)
    const idx = y * gw + x
    state[idx] = I
    timer[idx] = infDur
  }
}

/** Reset the whole grid to susceptible, then seed a fresh outbreak. */
function seedGrid(st: ContagionState): void {
  st.state.fill(S)
  st.timer.fill(0)
  seedFoci(st)
  recount(st)
}

function recount(st: ContagionState): void {
  const { state, gw, gh } = st
  const n = gw * gh
  let s = 0, i = 0, r = 0
  for (let k = 0; k < n; k++) {
    const v = state[k]
    if (v === S) s++
    else if (v === I) i++
    else r++
  }
  st.counts = { s: s / n, i: i / n, r: r / n }
}

export function createContagionState(cfg: ContagionConfig, w: number, h: number): ContagionState {
  const cell = cfg.cellSize
  const gw = Math.max(1, Math.ceil(w / cell))
  const gh = Math.max(1, Math.ceil(h / cell))
  const off = document.createElement('canvas')
  off.width = gw
  off.height = gh
  const offCtx = off.getContext('2d')
  if (!offCtx) throw new Error('Contagion requires a 2D context for its offscreen buffer')
  const n = gw * gh
  const histLen = 240
  const st: ContagionState = {
    cfg, w, h, gw, gh, cell,
    state: new Uint8Array(n), stateB: new Uint8Array(n),
    timer: new Uint16Array(n), timerB: new Uint16Array(n),
    disp: new Float32Array(n),
    rng: mulberry32(cfg.seed >>> 0),
    lut: buildLUT(cfg),
    counts: { s: 1, i: 0, r: 0 },
    history: new Float32Array(histLen), histLen, histHead: 0,
    off, offCtx, img: offCtx.createImageData(gw, gh),
    stepAcc: 0,
  }
  seedGrid(st)
  return st
}

/** Re-fit to a new display size. Reallocates + reseeds only when the cell grid
 *  actually changes dimensions (a CA fills the screen). */
export function resizeContagion(st: ContagionState, w: number, h: number): void {
  const gw = Math.max(1, Math.ceil(w / st.cell))
  const gh = Math.max(1, Math.ceil(h / st.cell))
  st.w = w
  st.h = h
  if (gw === st.gw && gh === st.gh) return
  const n = gw * gh
  st.gw = gw
  st.gh = gh
  st.state = new Uint8Array(n); st.stateB = new Uint8Array(n)
  st.timer = new Uint16Array(n); st.timerB = new Uint16Array(n)
  st.disp = new Float32Array(n)
  st.off.width = gw
  st.off.height = gh
  st.img = st.offCtx.createImageData(gw, gh)
  seedGrid(st)
}

/** One synchronous step of the SIR/SIRS automaton (toroidal). */
export function stepContagion(st: ContagionState): void {
  const { state, stateB, timer, timerB, gw, gh, cfg, rng } = st
  const beta = cfg.transmission
  const infDur = cfg.infectiousDuration
  const immDur = cfg.immunityDuration
  const spark = cfg.sparkRate
  const moore = cfg.neighborhood === 'Moore'
  for (let y = 0; y < gh; y++) {
    const ym = ((y - 1 + gh) % gh) * gw
    const y0 = y * gw
    const yp = ((y + 1) % gh) * gw
    for (let x = 0; x < gw; x++) {
      const xm = (x - 1 + gw) % gw
      const xp = (x + 1) % gw
      const i = y0 + x
      const s = state[i]
      if (s === I) {
        const t = timer[i] - 1
        if (t <= 0) { stateB[i] = R; timerB[i] = immDur } // immDur 0 → permanent R
        else { stateB[i] = I; timerB[i] = t }
      } else if (s === R) {
        if (immDur <= 0) { stateB[i] = R; timerB[i] = 0 } // SIR: immune forever
        else {
          const t = timer[i] - 1
          if (t <= 0) { stateB[i] = S; timerB[i] = 0 }
          else { stateB[i] = R; timerB[i] = t }
        }
      } else {
        // Susceptible: count infected neighbours, catch with prob 1-(1-β)^nI
        let nI = 0
        if (state[ym + x] === I) nI++
        if (state[yp + x] === I) nI++
        if (state[y0 + xm] === I) nI++
        if (state[y0 + xp] === I) nI++
        if (moore) {
          if (state[ym + xm] === I) nI++
          if (state[ym + xp] === I) nI++
          if (state[yp + xm] === I) nI++
          if (state[yp + xp] === I) nI++
        }
        let infected = false
        if (nI > 0) {
          const pStay = Math.pow(1 - beta, nI)
          infected = rng() >= pStay
        }
        // Background reintroduction: a stray spark seeds a fresh spiral core.
        if (!infected && spark > 0 && rng() < spark) infected = true
        if (infected) { stateB[i] = I; timerB[i] = infDur }
        else { stateB[i] = S; timerB[i] = 0 }
      }
    }
  }
  st.state = stateB; st.stateB = state
  st.timer = timerB; st.timerB = timer
  recount(st)
  // Never stall: if the outbreak has died out, seed a fresh one. When the field
  // has burned out to mostly-immune (SIR), reset it to susceptible first.
  if (st.counts.i === 0) {
    if (st.counts.s < 0.05) seedGrid(st)
    else { seedFoci(st); recount(st) }
  }
  // Record the infected fraction for the epidemic-curve history.
  st.history[st.histHead] = st.counts.i
  st.histHead = (st.histHead + 1) % st.histLen
}

/** Ease every cell's displayed phase toward its target and blit, scaled crisply.
 *  Called every frame so the phosphor glow keeps flowing between sim steps. */
export function renderContagion(st: ContagionState, ctx: CanvasRenderingContext2D): void {
  const { img, state, timer, disp, lut, gw, gh, cfg } = st
  const infDur = cfg.infectiousDuration
  const immDur = cfg.immunityDuration
  const ease = 1 - cfg.smoothing
  const data = img.data
  const n = gw * gh
  for (let i = 0; i < n; i++) {
    const target = phaseOf(state[i], timer[i], infDur, immDur)
    const d = disp[i] + (target - disp[i]) * ease
    disp[i] = d
    const k = (d <= 0 ? 0 : d >= 1 ? LUT_N - 1 : (d * (LUT_N - 1)) | 0) * 3
    const o = i * 4
    data[o] = lut[k]; data[o + 1] = lut[k + 1]; data[o + 2] = lut[k + 2]
    data[o + 3] = 255
  }
  st.offCtx.putImageData(img, 0, 0)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(st.off, 0, 0, gw * st.cell, gh * st.cell)
  if (cfg.showHud) renderHud(st, ctx)
}

/** Representative colour for a compartment, sampled from the live ramp. */
function rampColor(lut: Uint8Array, phase: number): string {
  const k = (Math.max(0, Math.min(1, phase)) * (LUT_N - 1) | 0) * 3
  return `rgb(${lut[k]},${lut[k + 1]},${lut[k + 2]})`
}

/** The epidemic-curve HUD: an S/I/R stacked bar + a scrolling infected-fraction
 *  history, drawn in CSS pixels over the blitted field. */
function renderHud(st: ContagionState, ctx: CanvasRenderingContext2D): void {
  const { w, h, counts, lut, history, histLen, histHead } = st
  const sCol = rampColor(lut, 0.06)
  const rCol = rampColor(lut, 0.4)
  const iCol = rampColor(lut, 0.9)

  const pad = 16
  const barW = Math.min(360, w - pad * 2)
  const barH = 10
  const x0 = pad
  const sparkH = 30
  const panelH = sparkH + barH + 26
  const y0 = h - pad - panelH

  ctx.save()
  // backing panel for legibility over any field colour
  ctx.fillStyle = 'rgba(0,0,0,0.42)'
  ctx.fillRect(x0 - 8, y0 - 8, barW + 16, panelH + 12)

  // scrolling infected-fraction history (peak-normalized so a small wave still reads)
  let peak = 0.02
  for (let k = 0; k < histLen; k++) if (history[k] > peak) peak = history[k]
  ctx.beginPath()
  for (let k = 0; k < histLen; k++) {
    const idx = (histHead + k) % histLen
    const px = x0 + (k / (histLen - 1)) * barW
    const py = y0 + sparkH - (history[idx] / peak) * sparkH
    if (k === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.strokeStyle = iCol
  ctx.lineWidth = 1.5
  ctx.stroke()

  // stacked S / I / R bar
  const barY = y0 + sparkH + 6
  const sw = counts.s * barW
  const iw = counts.i * barW
  const rw = counts.r * barW
  ctx.fillStyle = sCol; ctx.fillRect(x0, barY, sw, barH)
  ctx.fillStyle = rCol; ctx.fillRect(x0 + sw, barY, rw, barH)
  ctx.fillStyle = iCol; ctx.fillRect(x0 + sw + rw, barY, iw, barH)

  // legend
  ctx.font = '11px ui-monospace, monospace'
  ctx.textBaseline = 'top'
  const ly = barY + barH + 5
  const pct = (v: number) => `${Math.round(v * 100)}%`
  ctx.fillStyle = sCol; ctx.fillText(`S ${pct(counts.s)}`, x0, ly)
  ctx.fillStyle = iCol; ctx.fillText(`I ${pct(counts.i)}`, x0 + barW * 0.36, ly)
  ctx.fillStyle = rCol; ctx.fillText(`R ${pct(counts.r)}`, x0 + barW * 0.68, ly)
  ctx.restore()
}
