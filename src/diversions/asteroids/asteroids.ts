import { mulberry32, makeNoise3D } from '../../framework/rng'
import { parseHex6, mix, rgba, type RGB } from '../../framework/color'
import type { AsteroidsConfig } from './schema'

const TAU = Math.PI * 2
export type Pt = [number, number]

/** Scale an RGB by a brightness factor (per-rock tone), clamped to 0–255. */
function shade(c: RGB, k: number): RGB {
  return { r: Math.min(255, c.r * k), g: Math.min(255, c.g * k), b: Math.min(255, c.b * k) }
}

// ── Field generation (all seeded, deterministic) ────────────────────────────
export interface Crater { x: number; y: number; r: number }   // rock-local (radius ≈ 1)
export interface Mottle { x: number; y: number; r: number; v: number }  // value blotch, v∈[-1,1]
export interface Asteroid {
  verts: Pt[]      // unit-ish lumpy outline (mean radius ≈ 1)
  craters: Crater[]        // surface pits, rock-local
  mottles: Mottle[]        // value-noise blotches (light/dark stone patches), rock-local
  tone: number     // per-rock brightness multiplier (darker/lighter stone; rare icy-bright)
  wx: number; wy: number   // world placement (units of half-viewport-height)
  radius: number   // world units
  depth: number    // parallax rate (bigger/nearer → larger)
  rot: number      // starting orientation
  spin: number     // radians/sec tumble
}
export interface Star { wx: number; wy: number; b: number }
export interface Mote { wx: number; wy: number; r: number; ph: number }
export interface Field { asteroids: Asteroid[]; stars: Star[]; motes: Mote[] }

/** A lumpy rock outline: control points at jittered radii around the circle,
 *  plus a low harmonic and an anisotropic stretch so rocks read as irregular
 *  elongated potatoes, not circles. Rendered through smooth curves (see render),
 *  so these are lump centres — craggy but never needle-spiky. */
function rockOutline(rnd: () => number, jag: number): Pt[] {
  const n = 9 + Math.floor(rnd() * 4)   // 9–12 lumps
  const phase = rnd() * TAU
  const h2 = 0.5 + rnd() * 0.5          // low-harmonic weight (broad asymmetry)
  const verts: Pt[] = []
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU
    // Craggier than before: wider per-lump jitter + a broad 2-lobe undulation.
    const r = 1 + (rnd() - 0.5) * 0.62 * jag + Math.sin(a * 2 + phase) * 0.14 * jag * h2
    verts.push([Math.cos(a) * r, Math.sin(a) * r])
  }
  // Elongate along a random axis (perpendicular unchanged) → oblong rocks.
  const axis = rnd() * TAU, e = 1 + rnd() * 0.4    // stretch 1.0–1.4×
  const ax = Math.cos(axis), ay = Math.sin(axis)
  for (const v of verts) {
    const d = v[0] * ax + v[1] * ay
    v[0] += ax * d * (e - 1)
    v[1] += ay * d * (e - 1)
  }
  return verts
}

/** A few surface pits scattered inside the rock (rock-local coords). Kept small
 *  and sparse so they read as pits, not clustered rings. */
function makeCraters(rnd: () => number): Crater[] {
  const n = 3 + Math.floor(rnd() * 3)
  const craters: Crater[] = []
  for (let i = 0; i < n; i++) {
    const ang = rnd() * TAU, dist = Math.sqrt(rnd()) * 0.66
    craters.push({ x: Math.cos(ang) * dist, y: Math.sin(ang) * dist, r: 0.08 + rnd() * 0.16 })
  }
  return craters
}

/** Value-noise blotches — light and dark stone patches spread across the face,
 *  so the lit side is mottled rock rather than a clean gradient. A handful of
 *  broad patches plus a scatter of fine grain (small r, low amplitude). */
function makeMottles(rnd: () => number): Mottle[] {
  const mottles: Mottle[] = []
  const broad = 6 + Math.floor(rnd() * 5)      // 6–10 broad patches
  for (let i = 0; i < broad; i++) {
    const ang = rnd() * TAU, dist = Math.sqrt(rnd()) * 0.95
    mottles.push({
      x: Math.cos(ang) * dist, y: Math.sin(ang) * dist,
      r: 0.22 + rnd() * 0.42, v: rnd() * 2 - 1,
    })
  }
  const grain = 14 + Math.floor(rnd() * 10)    // 14–23 fine specks
  for (let i = 0; i < grain; i++) {
    const ang = rnd() * TAU, dist = Math.sqrt(rnd()) * 1.0
    mottles.push({
      x: Math.cos(ang) * dist, y: Math.sin(ang) * dist,
      r: 0.05 + rnd() * 0.11, v: (rnd() * 2 - 1) * 0.7,
    })
  }
  return mottles
}

export function generateField(cfg: AsteroidsConfig): Field {
  const rnd = mulberry32(cfg.seed >>> 0)

  const asteroids: Asteroid[] = []
  for (let i = 0; i < cfg.count; i++) {
    // Power-law size: many specks, few boulders (kept modest so the field breathes).
    const t = rnd()
    const radius = (0.025 + t * t * t * 0.2) * cfg.sizeScale
    const depth = 0.18 + (radius / (0.23 * cfg.sizeScale)) * 0.62   // bigger ⇒ nearer ⇒ more parallax
    const verts = rockOutline(rnd, cfg.jaggedness)
    const craters = makeCraters(rnd)
    const mottles = makeMottles(rnd)
    // Per-rock stone tone: most sit 0.74–1.2, a rare few icy-bright.
    let tone = 0.74 + rnd() * 0.46
    if (rnd() < 0.09) tone += 0.34
    asteroids.push({
      verts, craters, mottles, tone,
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

// ── Per-rock surface-detail sprites (grayscale, rock-local, light-independent) ─
// Baked once per field. Each is overlay-blended onto the lit body at draw time
// and rotates WITH the rock, so the sunlit face carries mottling + pitting that
// tumbles like real surface — the fix for the "smooth ball" read. Neutral grey
// (128) = no change; lighter/darker texels lighten/darken the body.
const SPRITE = 128
const SPRITE_EXT = 1.25   // rock-local half-extent the sprite spans (unit radius ≈ 1)

function bakeRockDetail(a: Asteroid): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  cv.width = SPRITE; cv.height = SPRITE
  const c = cv.getContext('2d')!
  const H = SPRITE / 2
  const s = H / SPRITE_EXT            // rock-local unit → sprite px
  c.fillStyle = 'rgb(128,128,128)'    // neutral base
  c.fillRect(0, 0, SPRITE, SPRITE)
  // Value-noise mottling — soft light/dark stone patches. Strong enough to
  // break the smooth-sphere read under an overlay blend.
  for (const m of a.mottles) {
    const px = H + m.x * s, py = H + m.y * s, pr = m.r * s
    const g = Math.max(0, Math.min(255, 128 + m.v * 96))   // toward light/dark
    const rg = c.createRadialGradient(px, py, 0, px, py, pr)
    rg.addColorStop(0, `rgba(${g | 0},${g | 0},${g | 0},0.9)`)
    rg.addColorStop(1, `rgba(${g | 0},${g | 0},${g | 0},0)`)
    c.fillStyle = rg
    c.fillRect(px - pr, py - pr, pr * 2, pr * 2)
  }
  // Craters — soft dark depressions (no bright ring; the ring read as bubbles).
  // A faint sliver of shadow at the centre gives a little depth.
  for (const cr of a.craters) {
    const px = H + cr.x * s, py = H + cr.y * s, pr = cr.r * s * 1.5
    const rg = c.createRadialGradient(px, py, 0, px, py, pr)
    rg.addColorStop(0, 'rgba(52,52,52,0.7)')
    rg.addColorStop(0.6, 'rgba(78,78,78,0.34)')
    rg.addColorStop(1, 'rgba(128,128,128,0)')
    c.fillStyle = rg
    c.fillRect(px - pr, py - pr, pr * 2, pr * 2)
  }
  return cv
}

// ── Runtime state ───────────────────────────────────────────────────────────
export interface AsteroidsState {
  cfg: AsteroidsConfig
  w: number; h: number
  t: number
  field: Field
  details: HTMLCanvasElement[]   // one per field.asteroids entry, same order
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
  const field = generateField(cfg)
  const s: AsteroidsState = {
    cfg, w, h, t: 0, field, details: field.asteroids.map(bakeRockDetail), neb, dust,
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
  const rockLit = parseHex6(cfg.rockLit)
  const rim = parseHex6(cfg.rimColor)
  const cool = { r: 44, g: 50, b: 78 }   // faint nebula bounce so shadow isn't dead black
  for (let ai = 0; ai < s.field.asteroids.length; ai++) {
    const a = s.field.asteroids[ai]
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
    // Body shading: grey-brown stone, bright on the sun edge → dark far side,
    // scaled by this rock's tone. Crisper terminator than a plain 3-stop ramp.
    const dirx = sx - cx, diry = sy - cy
    const dl = Math.hypot(dirx, diry) || 1
    const ux = dirx / dl, uy = diry / dl
    const lit = shade(rockLit, a.tone)
    const shadow = shade(mix(rockC, cool, 0.22), a.tone * 0.92)
    const mid = mix(shadow, lit, 0.42)
    const body = ctx.createLinearGradient(cx + ux * rad, cy + uy * rad, cx - ux * rad * 0.95, cy - uy * rad * 0.95)
    body.addColorStop(0, rgba(lit, 1))
    body.addColorStop(0.34, rgba(mix(mid, lit, 0.5), 1))
    body.addColorStop(0.52, rgba(mid, 1))
    body.addColorStop(0.64, rgba(mix(mid, shadow, 0.72), 1))   // sharp drop = terminator
    body.addColorStop(1, rgba(shadow, 1))
    ctx.fillStyle = body
    ctx.fill()

    // Surface detail (mottling + pits) + warm rim, clipped to the rock.
    ctx.save()
    ctx.clip()
    // Overlay the baked grayscale detail sprite, rotated with the rock so the
    // texture tumbles. Neutral grey = no change; blotches modulate the body.
    if (cfg.mottle > 0) {
      ctx.save()
      ctx.globalCompositeOperation = 'overlay'
      ctx.globalAlpha = cfg.mottle
      ctx.translate(cx, cy)
      ctx.rotate(ang)
      const S = SPRITE_EXT * rad
      ctx.drawImage(s.details[ai], -S, -S, S * 2, S * 2)
      ctx.restore()
    }
    // Thin warm rim-light crescent kissing the sun-facing edge.
    if (cfg.rimLight > 0) {
      ctx.globalCompositeOperation = 'screen'
      const ex = cx + ux * rad, ey = cy + uy * rad
      const rg = ctx.createRadialGradient(ex, ey, 0, ex, ey, rad * 0.95)
      rg.addColorStop(0, rgba(rim, 0.5 * cfg.rimLight))
      rg.addColorStop(0.5, rgba(rim, 0.12 * cfg.rimLight))
      rg.addColorStop(1, rgba(rim, 0))
      ctx.fillStyle = rg
      ctx.fillRect(cx - rad * 2, cy - rad * 2, rad * 4, rad * 4)
    }
    ctx.restore()
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
  if (fieldSignature(cfg) !== pField) {
    s.field = generateField(cfg)
    s.details = s.field.asteroids.map(bakeRockDetail)
    s.fieldSig = fieldSignature(cfg)
  }
  if (nebSignature(cfg) !== pNeb) bakeNebula(s)
  if (dustSignature(cfg) !== pDust) bakeDust(s)
}
