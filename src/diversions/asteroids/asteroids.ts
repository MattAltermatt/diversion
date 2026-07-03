import { mulberry32, makeNoise3D } from '../../framework/rng'
import { parseHex6, mix, rgba, type RGB } from '../../framework/color'
import type { AsteroidsConfig } from './schema'

const TAU = Math.PI * 2
export type Pt = [number, number]

// ── Field generation (all seeded, deterministic) ────────────────────────────
export interface Crater { x: number; y: number; r: number }   // rock-local (radius ≈ 1)
export interface Asteroid {
  verts: Pt[]      // unit-ish lumpy outline (mean radius ≈ 1)
  craters: Crater[]        // surface pits, rock-local
  wx: number; wy: number   // world placement (units of half-viewport-height)
  radius: number   // world units
  depth: number    // parallax rate (bigger/nearer → larger)
  rot: number      // starting orientation
  spin: number     // radians/sec tumble
}
export interface Star { wx: number; wy: number; b: number }
export interface Mote { wx: number; wy: number; r: number; ph: number }
export interface Field { asteroids: Asteroid[]; stars: Star[]; motes: Mote[] }

/** A lumpy rock outline: control points at gently-jittered radii around the
 *  circle. Rendered through smooth curves (see render), so these are lump
 *  centres — kept mild so the silhouette stays rounded, never spiky. */
function rockOutline(rnd: () => number, jag: number): Pt[] {
  const n = 8 + Math.floor(rnd() * 4)   // 8–11 lumps
  const verts: Pt[] = []
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU
    const r = 1 + (rnd() - 0.5) * 0.5 * jag   // gentle: ~0.78..1.22 at jag=1
    verts.push([Math.cos(a) * r, Math.sin(a) * r])
  }
  return verts
}

/** A few surface pits scattered inside the rock (rock-local coords). */
function makeCraters(rnd: () => number): Crater[] {
  const n = 3 + Math.floor(rnd() * 4)
  const craters: Crater[] = []
  for (let i = 0; i < n; i++) {
    const ang = rnd() * TAU, dist = Math.sqrt(rnd()) * 0.62
    craters.push({ x: Math.cos(ang) * dist, y: Math.sin(ang) * dist, r: 0.1 + rnd() * 0.22 })
  }
  return craters
}

export function generateField(cfg: AsteroidsConfig): Field {
  const rnd = mulberry32(cfg.seed >>> 0)

  const asteroids: Asteroid[] = []
  for (let i = 0; i < cfg.count; i++) {
    // Power-law size: many specks, few boulders (kept modest so the field breathes).
    const t = rnd()
    const radius = (0.025 + t * t * t * 0.2) * cfg.sizeScale
    const depth = 0.18 + (radius / (0.23 * cfg.sizeScale)) * 0.62   // bigger ⇒ nearer ⇒ more parallax
    asteroids.push({
      verts: rockOutline(rnd, cfg.jaggedness),
      craters: makeCraters(rnd),
      wx: (rnd() - 0.5) * 4.0,
      wy: (rnd() - 0.5) * 2.4,
      radius,
      depth,
      rot: rnd() * TAU,
      spin: (rnd() - 0.5) * 0.3,
    })
  }
  // Draw distant (small) rocks first so near boulders occlude them.
  asteroids.sort((a, b) => a.depth - b.depth)

  const nStars = Math.round(cfg.stars * 320)
  const stars: Star[] = []
  for (let i = 0; i < nStars; i++) {
    stars.push({ wx: (rnd() - 0.5) * 4.2, wy: (rnd() - 0.5) * 2.6, b: 0.2 + rnd() * 0.8 })
  }

  const nMotes = Math.round(cfg.dust * 140)
  const motes: Mote[] = []
  for (let i = 0; i < nMotes; i++) {
    motes.push({
      wx: (rnd() - 0.5) * 3.4, wy: (rnd() - 0.5) * 2.2,
      r: 0.4 + rnd() * 1.6, ph: rnd() * TAU,
    })
  }
  return { asteroids, stars, motes }
}

// ── Nebula + dust bakes (low-frequency by construction) ─────────────────────
export const NEB_W = 256
export const NEB_H = 160
export const DUST_W = 256
export const DUST_H = 160

function buildLut(cfg: AsteroidsConfig): RGB[] {
  const stops = [parseHex6(cfg.background), ...cfg.nebula.map(parseHex6)]
  const lut: RGB[] = new Array(256)
  const segs = stops.length - 1
  for (let i = 0; i < 256; i++) {
    const f = (i / 255) * segs
    const k = Math.min(segs - 1, Math.floor(f))
    lut[i] = mix(stops[k], stops[k + 1], f - k)
  }
  return lut
}

/** Deterministic nebula pixels (pure — unit-testable). */
export function buildNebulaData(cfg: AsteroidsConfig, w = NEB_W, h = NEB_H): Uint8ClampedArray {
  const noise = makeNoise3D(cfg.seed >>> 0)
  const lut = buildLut(cfg)
  const sun = parseHex6(cfg.sunColor)
  const data = new Uint8ClampedArray(w * h * 4)
  const sc = cfg.cloudScale * 3
  const cpow = 0.5 + cfg.contrast * 1.6
  for (let j = 0; j < h; j++) {
    const v = j / h
    for (let i = 0; i < w; i++) {
      const u = i / w
      const b = noise(u * sc, v * sc, 0)
      const d1 = noise(u * sc * 2.4 + 11, v * sc * 2.4 + 7, 5) * 0.5
      const d2 = noise(u * sc * 5.1 + 23, v * sc * 5.1 + 17, 9) * 0.25
      let f = b * 0.7 + (d1 + d2) * cfg.wispiness
      f = 0.5 + Math.sign(f) * Math.pow(Math.abs(f), 1 / cpow) * 0.5
      const sunProx = Math.max(0, 1 - Math.hypot(u - cfg.sunX, v - cfg.sunY) / 0.75)
      f += sunProx * 0.18 * cfg.sunGlow
      f += (((i * 7 + j * 13) & 3) - 1.5) * (1.2 / 255)
      const idx = Math.max(0, Math.min(255, Math.round(f * 255)))
      let c = lut[idx]
      // Warm illuminated cloud near the sun: blotchy (cloud-modulated) so the
      // light reads as scattering THROUGH dust, not a clean radial wash.
      const cloud = Math.max(0, 0.45 + (d1 + d2) * 1.3)   // 0..~1, lumpy
      const warm = Math.min(0.85, sunProx * sunProx * cloud * cfg.sunGlow * 1.4)
      if (warm > 0.001) c = mix(c, sun, warm)
      const o = (j * w + i) * 4
      data[o] = c.r; data[o + 1] = c.g; data[o + 2] = c.b; data[o + 3] = 255
    }
  }
  return data
}

/** Dark dust-lane veil (pure). RGB = a dark dusty colour, A = coverage — so
 *  drawn over the scene it darkens the sun where dust is dense and shows through
 *  the gaps. Wispy, mostly-clear thresholded noise = lanes, not full cover. */
export function buildDustData(cfg: AsteroidsConfig, w = DUST_W, h = DUST_H): Uint8ClampedArray {
  const noise = makeNoise3D((cfg.seed ^ 0x5bd1e995) >>> 0)
  const dark = mix(parseHex6(cfg.background), { r: 0, g: 0, b: 0 }, 0.45)
  const data = new Uint8ClampedArray(w * h * 4)
  const sc = cfg.cloudScale * 2.0
  for (let j = 0; j < h; j++) {
    const v = j / h
    for (let i = 0; i < w; i++) {
      const u = i / w
      const n = noise(u * sc, v * sc, 3) * 0.6 + noise(u * sc * 2.7 + 5, v * sc * 2.7 + 9, 8) * 0.4
      const d = (n + 1) * 0.5                       // 0..1
      // Threshold into billows: clear below `lo`, ramping to opaque by `hi`. A low
      // threshold keeps broad soft banks (so the light is genuinely veiled), not
      // thin wisps.
      const cov = Math.max(0, Math.min(1, (d - 0.34) / 0.42))
      const a = cov * cov * cfg.dustLanes
      const o = (j * w + i) * 4
      data[o] = dark.r; data[o + 1] = dark.g; data[o + 2] = dark.b
      data[o + 3] = Math.round(a * 255)
    }
  }
  return data
}

// ── Runtime state ───────────────────────────────────────────────────────────
export interface AsteroidsState {
  cfg: AsteroidsConfig
  w: number; h: number
  t: number
  field: Field
  neb: HTMLCanvasElement
  dust: HTMLCanvasElement
  nebSig: string; dustSig: string; fieldSig: string
}

function nebSignature(c: AsteroidsConfig): string {
  return [c.seed, c.cloudScale, c.wispiness, c.contrast, c.sunX, c.sunY, c.sunGlow,
    c.nebula.join(','), c.background, c.sunColor].join('|')
}
function dustSignature(c: AsteroidsConfig): string {
  return [c.seed, c.cloudScale, c.dustLanes, c.background].join('|')
}
function fieldSignature(c: AsteroidsConfig): string {
  return [c.seed, c.count, c.sizeScale, c.jaggedness, c.stars, c.dust].join('|')
}

function bakeNebula(s: AsteroidsState): void {
  const bctx = s.neb.getContext('2d')!
  const img = bctx.createImageData(NEB_W, NEB_H)
  img.data.set(buildNebulaData(s.cfg))
  bctx.putImageData(img, 0, 0)
  s.nebSig = nebSignature(s.cfg)
}
function bakeDust(s: AsteroidsState): void {
  const dctx = s.dust.getContext('2d')!
  const img = dctx.createImageData(DUST_W, DUST_H)
  img.data.set(buildDustData(s.cfg))
  dctx.putImageData(img, 0, 0)
  s.dustSig = dustSignature(s.cfg)
}

export function createState(cfg: AsteroidsConfig, w: number, h: number): AsteroidsState {
  const neb = document.createElement('canvas')
  neb.width = NEB_W; neb.height = NEB_H
  const dust = document.createElement('canvas')
  dust.width = DUST_W; dust.height = DUST_H
  const s: AsteroidsState = {
    cfg, w, h, t: 0, field: generateField(cfg), neb, dust,
    nebSig: '', dustSig: '', fieldSig: fieldSignature(cfg),
  }
  bakeNebula(s)
  bakeDust(s)
  return s
}

// ── Camera ──────────────────────────────────────────────────────────────────
function camera(s: AsteroidsState): { x: number; y: number } {
  const c = s.cfg
  if (c.panMode === 'Pan') {
    const a = (c.panAngle * Math.PI) / 180
    const d = s.t * c.panSpeed * 0.05
    return { x: Math.cos(a) * d, y: Math.sin(a) * d }
  }
  const k = c.panSpeed * 0.06, r = c.panRange * 0.85
  return { x: Math.sin(s.t * k) * r, y: Math.sin(s.t * k * 0.72 + 1.3) * r * 0.6 }
}

// ── Render ──────────────────────────────────────────────────────────────────
export function render(s: AsteroidsState, ctx: CanvasRenderingContext2D): void {
  const { w, h, cfg } = s
  const unit = h / 2
  const cam = camera(s)
  const maxd = Math.hypot(w, h)
  const sx = cfg.sunX * w, sy = cfg.sunY * h

  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = rgba(parseHex6(cfg.background), 1)
  ctx.fillRect(0, 0, w, h)

  // 1 · Stars (far, sharp)
  if (s.field.stars.length) {
    ctx.globalCompositeOperation = 'screen'
    for (const st of s.field.stars) {
      const px = w / 2 + (st.wx - cam.x * 0.05) * unit
      const py = h / 2 + (st.wy - cam.y * 0.05) * unit
      if (px < -2 || px > w + 2 || py < -2 || py > h + 2) continue
      ctx.fillStyle = `rgba(220,225,255,${(0.25 + st.b * 0.55) * cfg.stars})`
      ctx.fillRect(px, py, st.b > 0.75 ? 1.5 : 1, st.b > 0.75 ? 1.5 : 1)
    }
    ctx.globalCompositeOperation = 'source-over'
  }

  // 2 · Nebula — low-res bake stretched over the viewport with parallax overscan
  const over = 0.16 * maxd
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(s.neb,
    -over - cam.x * 0.12 * unit, -over - cam.y * 0.12 * unit,
    w + over * 2, h + over * 2)

  // 3 · Sun bleed + god-rays (screen-blended warm light)
  const glow = cfg.sunGlow
  if (glow > 0) {
    const sun = parseHex6(cfg.sunColor)
    ctx.globalCompositeOperation = 'screen'
    if (cfg.rayCount > 0 && cfg.rayReach > 0) {
      const len = cfg.rayReach * maxd
      for (let k = 0; k < cfg.rayCount; k++) {
        const a = (k / cfg.rayCount) * TAU + s.t * 0.01 + (k % 3) * 0.4
        const wdt = 0.1 + (k % 2) * 0.06   // broader, softer shafts (less lens-flare)
        const g = ctx.createLinearGradient(sx, sy, sx + Math.cos(a) * len, sy + Math.sin(a) * len)
        g.addColorStop(0, rgba(sun, 0.07 * glow))
        g.addColorStop(0.5, rgba(sun, 0.02 * glow))
        g.addColorStop(1, rgba(sun, 0))
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.moveTo(sx, sy)
        ctx.lineTo(sx + Math.cos(a - wdt) * len, sy + Math.sin(a - wdt) * len)
        ctx.lineTo(sx + Math.cos(a + wdt) * len, sy + Math.sin(a + wdt) * len)
        ctx.closePath()
        ctx.fill()
      }
    }
    const R = cfg.sunSize * Math.min(w, h) * 1.15
    const halo = ctx.createRadialGradient(sx, sy, 0, sx, sy, R)
    halo.addColorStop(0, rgba(sun, 0.8 * glow))
    halo.addColorStop(0.4, rgba(sun, 0.24 * glow))
    halo.addColorStop(1, rgba(sun, 0))
    ctx.fillStyle = halo
    ctx.fillRect(0, 0, w, h)
    const core = ctx.createRadialGradient(sx, sy, 0, sx, sy, R * 0.18)
    const white = mix(sun, { r: 255, g: 255, b: 255 }, 0.6)
    core.addColorStop(0, rgba(white, 0.85 * glow))
    core.addColorStop(1, rgba(white, 0))
    ctx.fillStyle = core
    ctx.fillRect(0, 0, w, h)
    ctx.globalCompositeOperation = 'source-over'
  }

  // 4 · Dust lanes — dark veil drifting IN FRONT of the sun (the atmosphere).
  //     Drawn twice at two depths for a layered, volumetric filtering.
  if (cfg.dustLanes > 0) {
    ctx.globalCompositeOperation = 'source-over'
    const d1 = 0.14 * maxd
    ctx.drawImage(s.dust,
      -d1 - cam.x * 0.2 * unit, -d1 - cam.y * 0.2 * unit,
      w + d1 * 2, h + d1 * 2)
    const d2 = 0.22 * maxd   // a nearer, offset pass so the veil has depth
    ctx.globalAlpha = 0.8
    ctx.drawImage(s.dust,
      -d2 + 0.15 * w - cam.x * 0.42 * unit, -d2 + 0.08 * h - cam.y * 0.42 * unit,
      w + d2 * 2, h + d2 * 2)
    ctx.globalAlpha = 1
  }

  // 5 · Asteroids (back→front) — lit rock: sunlit face → shadow terminator,
  //     cool nebula ambient on the dark side, pitted with craters.
  const rockC = parseHex6(cfg.rockColor)
  const rim = parseHex6(cfg.rimColor)
  const cool = { r: 44, g: 50, b: 78 }   // faint nebula bounce so shadow isn't dead black
  for (const a of s.field.asteroids) {
    const cx = w / 2 + (a.wx - cam.x * a.depth) * unit
    const cy = h / 2 + (a.wy - cam.y * a.depth) * unit
    const rad = a.radius * unit
    if (cx < -rad * 2 || cx > w + rad * 2 || cy < -rad * 2 || cy > h + rad * 2) continue
    const ang = a.rot + s.t * a.spin * cfg.tumble
    const ca = Math.cos(ang), sa = Math.sin(ang)
    // Transform the lump centres to screen, then round every corner with a
    // quadratic curve through the edge midpoints — lumpy, never faceted/spiky.
    const n = a.verts.length
    const px: number[] = new Array(n), py: number[] = new Array(n)
    for (let k = 0; k < n; k++) {
      const vx = a.verts[k][0] * rad, vy = a.verts[k][1] * rad
      px[k] = cx + vx * ca - vy * sa
      py[k] = cy + vx * sa + vy * ca
    }
    ctx.beginPath()
    ctx.moveTo((px[n - 1] + px[0]) / 2, (py[n - 1] + py[0]) / 2)
    for (let k = 0; k < n; k++) {
      const nx = (px[k] + px[(k + 1) % n]) / 2, ny = (py[k] + py[(k + 1) % n]) / 2
      ctx.quadraticCurveTo(px[k], py[k], nx, ny)
    }
    ctx.closePath()
    // Body shading: bright rock on the sun edge → dark on the far side.
    const dirx = sx - cx, diry = sy - cy
    const dl = Math.hypot(dirx, diry) || 1
    const ux = dirx / dl, uy = diry / dl
    const litMix = 0.28 + cfg.rimLight * 0.5
    const lit = mix(rockC, rim, litMix)
    const shadow = mix(rockC, cool, 0.2)
    const mid = mix(shadow, lit, 0.32)
    const body = ctx.createLinearGradient(cx + ux * rad, cy + uy * rad, cx - ux * rad * 0.9, cy - uy * rad * 0.9)
    body.addColorStop(0, rgba(lit, 1))
    body.addColorStop(0.5, rgba(mid, 1))
    body.addColorStop(1, rgba(shadow, 1))
    ctx.fillStyle = body
    ctx.fill()
    // Surface craters (soft dark pits), clipped to the rock.
    if (a.craters.length) {
      ctx.save()
      ctx.clip()
      const pit = mix(shadow, { r: 0, g: 0, b: 0 }, 0.55)
      for (const cr of a.craters) {
        const lx = cr.x * rad, ly = cr.y * rad
        const qx = cx + lx * ca - ly * sa, qy = cy + lx * sa + ly * ca
        const crr = cr.r * rad
        const cg = ctx.createRadialGradient(qx, qy, 0, qx, qy, crr)
        cg.addColorStop(0, rgba(pit, 0.5))
        cg.addColorStop(0.7, rgba(pit, 0.18))
        cg.addColorStop(1, rgba(pit, 0))
        ctx.fillStyle = cg
        ctx.fillRect(qx - crr, qy - crr, crr * 2, crr * 2)
      }
      ctx.restore()
    }
  }

  // 6 · Dust motes (nearest, faint twinkle)
  if (s.field.motes.length) {
    ctx.globalCompositeOperation = 'screen'
    for (const m of s.field.motes) {
      const px = w / 2 + (m.wx - cam.x) * unit
      const py = h / 2 + (m.wy - cam.y) * unit
      if (px < -4 || px > w + 4 || py < -4 || py > h + 4) continue
      const tw = 0.5 + 0.5 * Math.sin(s.t * 0.5 + m.ph)
      ctx.fillStyle = `rgba(205,184,255,${0.14 * cfg.dust * tw})`
      ctx.beginPath()
      ctx.arc(px, py, m.r, 0, TAU)
      ctx.fill()
    }
    ctx.globalCompositeOperation = 'source-over'
  }
}

// ── Live-config reconciliation ──────────────────────────────────────────────
export function applyUpdate(s: AsteroidsState, cfg: AsteroidsConfig): void {
  const pNeb = s.nebSig, pDust = s.dustSig, pField = s.fieldSig
  s.cfg = cfg
  if (fieldSignature(cfg) !== pField) { s.field = generateField(cfg); s.fieldSig = fieldSignature(cfg) }
  if (nebSignature(cfg) !== pNeb) bakeNebula(s)
  if (dustSignature(cfg) !== pDust) bakeDust(s)
}
