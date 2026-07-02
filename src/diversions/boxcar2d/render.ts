/**
 * render.ts — draws the live BoxCar2D scene to the 2D canvas.
 *
 * The physics seam works in meters (Y-up); this is the SINGLE place that converts
 * to canvas space (pixels, Y-down): `* m2px`, a Y-flip, and a camera offset that
 * smoothly follows the current car. Terrain is sampled from the endless height
 * function across the viewport (no stored array). Cars are drawn as wireframes —
 * outline + centre spokes + translucent fill — so the structure of each car reads clearly.
 */
import { getBodyPosition, getBodyAngle, SCALE } from './physics'
import { carCentroid } from './car'
import type { BoxCarState } from './index'

const ZOOM = 2.2
const RENDER_STEP = 1.5 // meters between terrain samples (matches collision facets)

/** True if a #rrggbb colour is light enough to need dark ink on top of it. */
function isLight(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return 0.299 * r + 0.587 * g + 0.114 * b > 140
}

/** Linear blend of two #rrggbb colours, t=0 → a, t=1 → b. */
function mixHex(a: string, b: string, t: number): string {
  const ca = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16))
  const cb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16))
  const m = ca.map((v, i) => Math.round(v + (cb[i] - v) * t))
  return '#' + m.map((v) => v.toString(16).padStart(2, '0')).join('')
}

/** Palette-aware horizon colour for the sky gradient's bottom stop. A light
 *  (daytime) sky hazes toward white near the horizon (atmospheric perspective);
 *  a dark (dusk/night) sky keeps its moody near-black bottom. */
function horizonColor(sky: string): string {
  return isLight(sky) ? mixHex(sky, '#ffffff', 0.55) : mixHex(sky, '#05060a', 0.6)
}

function hexRgba(hex: string, a: number): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return `rgba(${r},${g},${b},${a})`
}

/** Deterministic pseudo-random in [0,1) from an integer slot — endless clouds. */
function slotRand(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

/** Smooth non-repeating silhouette height in [0,1] (sum of incommensurate sines). */
function hillY(u: number, seed: number): number {
  return (
    0.5 +
    0.26 * Math.sin(u * 0.9 + seed) +
    0.16 * Math.sin(u * 2.13 + seed * 1.7) +
    0.06 * Math.sin(u * 4.7 + seed * 0.3)
  )
}

/** One hazy hill silhouette band, scrolling at `parallax`× the terrain speed. */
function drawHillBand(
  ctx: CanvasRenderingContext2D,
  s: BoxCarState,
  o: { parallax: number; freq: number; baseFrac: number; ampFrac: number; color: string; seed: number },
): void {
  const { width, height } = s.size
  const m2px = SCALE * ZOOM
  const off = s.camMX * o.parallax
  const baseY = height * o.baseFrac
  const amp = height * o.ampFrac
  ctx.fillStyle = o.color
  ctx.beginPath()
  ctx.moveTo(0, height)
  for (let X = 0; X <= width; X += 10) {
    const u = (off + X / m2px) * o.freq
    ctx.lineTo(X, baseY - hillY(u, o.seed) * amp)
  }
  ctx.lineTo(width, height)
  ctx.closePath()
  ctx.fill()
}

/** Parallax background: sun/moon + drifting clouds + two hazy hill silhouettes,
 *  each scrolling slower than the foreground terrain to give depth + a speed cue.
 *  Drawn after the sky fill, before the terrain polygon (terrain hides their feet). */
function drawBackground(ctx: CanvasRenderingContext2D, s: BoxCarState): void {
  const { width, height } = s.size
  const m2px = SCALE * ZOOM
  const sky = s.cfg.color.sky
  const terrain = s.cfg.color.terrain
  const light = isLight(sky)

  // sun / moon — celestial, effectively fixed against the sky
  const sunX = width * 0.78, sunY = height * 0.17
  const sunR = Math.min(width, height) * 0.055
  const sunCol = light ? '#fff4c2' : '#e6ecf5'
  const halo = ctx.createRadialGradient(sunX, sunY, sunR * 0.6, sunX, sunY, sunR * 3.2)
  halo.addColorStop(0, hexRgba(sunCol, 0.55))
  halo.addColorStop(1, hexRgba(sunCol, 0))
  ctx.fillStyle = halo
  ctx.fillRect(sunX - sunR * 3.2, sunY - sunR * 3.2, sunR * 6.4, sunR * 6.4)
  ctx.fillStyle = hexRgba(sunCol, light ? 0.9 : 0.7)
  ctx.beginPath()
  ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2)
  ctx.fill()

  // far hills — hazy, mostly sky-tinted, slow scroll
  drawHillBand(ctx, s, {
    parallax: 0.22, freq: 0.5, baseFrac: 0.60, ampFrac: 0.10,
    color: mixHex(terrain, sky, 0.6), seed: 1.3,
  })

  // drifting clouds — evenly spaced in SCREEN space (not world meters, or the
  // 70px/m terrain scale would leave only ~1 per screen), scrolled by a slow
  // parallax offset so they drift left as the car advances.
  const pc = 0.16
  const spacingPx = height * 0.36 // screen px between cloud slots
  const scroll = s.camMX * pc * m2px
  const margin = height * 0.4
  const first = Math.floor((scroll - margin) / spacingPx)
  const last = Math.ceil((scroll + width + margin) / spacingPx)
  const cloudCol = light ? 'rgba(255,255,255,0.85)' : 'rgba(205,214,228,0.16)'
  ctx.fillStyle = cloudCol
  for (let i = first; i <= last; i++) {
    if (slotRand(i) < 0.35) continue // not every slot has a cloud
    const X = i * spacingPx - scroll
    const Y = height * (0.10 + 0.14 * slotRand(i * 2 + 1))
    const r = height * (0.030 + 0.030 * slotRand(i * 3 + 2))
    for (const [dx, dy, rs] of [[-r, 0.15 * r, 0.75], [0, -0.35 * r, 1], [r, 0.1 * r, 0.8], [2 * r, 0.2 * r, 0.6]] as const) {
      ctx.beginPath()
      ctx.arc(X + dx, Y + dy, r * rs, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // mid hills — closer, more terrain-coloured, faster scroll
  drawHillBand(ctx, s, {
    parallax: 0.44, freq: 0.85, baseFrac: 0.67, ampFrac: 0.13,
    color: mixHex(terrain, sky, 0.34), seed: 4.7,
  })
}

/** Foreground ground detail: scattered grass tufts planted along the terrain
 *  surface, deterministic from world-x so they scroll rigidly with the ground —
 *  a foreground speed cue that complements the parallax background. */
function drawGroundDetail(
  ctx: CanvasRenderingContext2D,
  s: BoxCarState,
  sx: (wx: number) => number,
  sy: (wy: number) => number,
  startX: number,
  endX: number,
): void {
  const m2px = SCALE * ZOOM
  const H = s.terrainHeight
  const terrain = s.cfg.color.terrain
  const bladeCol = mixHex(terrain, isLight(s.cfg.color.sky) ? '#eaf3e0' : '#93b088', 0.35)
  const step = 2.4 // meters between potential tufts
  const i0 = Math.floor(startX / step)
  const i1 = Math.ceil(endX / step)
  ctx.lineCap = 'round'
  ctx.strokeStyle = bladeCol
  ctx.lineWidth = 2
  for (let i = i0; i <= i1; i++) {
    if (slotRand(i * 7 + 3) < 0.28) continue // gaps — sparse, calm
    const wx = i * step + (slotRand(i * 5 + 1) - 0.5) * step * 0.7
    const bx = sx(wx), by = sy(H(wx))
    const blades = 2 + Math.floor(slotRand(i * 11 + 2) * 2) // 2–3 blades per tuft
    const base = (0.22 + 0.24 * slotRand(i * 13 + 4)) * m2px // tuft height (px)
    for (let b = 0; b < blades; b++) {
      const spread = b - (blades - 1) / 2
      const rootX = bx + spread * 0.05 * m2px
      const h = base * (0.7 + 0.5 * slotRand(i * 19 + b))
      const lean = (spread * 0.16 + (slotRand(i * 17 + b) - 0.5) * 0.2) * m2px
      ctx.beginPath()
      ctx.moveTo(rootX, by)
      ctx.quadraticCurveTo(rootX + lean * 0.5, by - h * 0.6, rootX + lean, by - h)
      ctx.stroke()
    }
  }
  ctx.lineCap = 'butt'
}

const SPRING_THRESH = 0.55       // stiffness ≥ this draws as a straight bar
const SPRING_COLOR = '#7fd1c4'   // accent for springy members (high contrast vs sky)

/** Draw a coil between two canvas points — reads as a spring. */
function drawSpring(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1
  const ux = dx / len, uy = dy / len, px = -uy, py = ux
  const coils = 6, amp = 5, inset = len * 0.18
  const sx = x1 + ux * inset, sy = y1 + uy * inset
  const ex = x2 - ux * inset, ey = y2 - uy * inset
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(sx, sy)
  const seg = coils * 2
  for (let i = 1; i < seg; i++) {
    const t = i / seg
    const cx = sx + (ex - sx) * t, cy = sy + (ey - sy) * t
    const s = i % 2 ? 1 : -1
    ctx.lineTo(cx + px * amp * s, cy + py * amp * s)
  }
  ctx.lineTo(ex, ey)
  ctx.lineTo(x2, y2)
  ctx.stroke()
}

/** Time-mode pre-record marker (#221②): until any car finishes, a furthest-reached
 *  flag + a `Dist … m` readout so the progress toward the goal reads at a glance. */
function drawFurthestFlag(
  ctx: CanvasRenderingContext2D,
  s: BoxCarState,
  sx: (wx: number) => number,
  ink: string,
): void {
  const { height } = s.size
  const fx = sx(s.spawnX + s.furthestMeters)
  ctx.strokeStyle = ink
  ctx.globalAlpha = 0.4
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(fx, 0)
  ctx.lineTo(fx, height)
  ctx.stroke()
  ctx.globalAlpha = 1
  ctx.fillStyle = '#ff5d5d'
  ctx.beginPath()
  ctx.moveTo(fx, 18)
  ctx.lineTo(fx + 15, 24)
  ctx.lineTo(fx, 30)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = ink
  ctx.font = 'bold 13px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(`Dist ${s.furthestMeters.toFixed(0)} m`, fx + 6, 34)
}

/** Start→goal progress ribbon (#229): a thin always-visible bar at the top with the
 *  current car's dot and a furthest-reached / record marker — cheaper to read than the
 *  HUD distance number. Time mode spans 0→goal; distance mode spans 0→best-so-far. */
function drawRibbon(ctx: CanvasRenderingContext2D, s: BoxCarState): void {
  const { width } = s.size
  const pad = 14
  const y = 1
  const h = 4
  const dotR = 4 // dot bottom (y + h/2 + dotR = 7) clears the HUD plate top (y = 8)
  const x0 = pad
  const w = width - pad * 2
  const isTime = s.cfg.mode === 'time'
  const span = isTime ? s.cfg.goalDistance : Math.max(1, s.bestDistMeters, s.furthestMeters)
  const cur = Math.max(0, carCentroid(s.current).x - s.spawnX)
  const marker = isTime ? s.furthestMeters : s.bestDistMeters
  // track
  ctx.fillStyle = 'rgba(255,255,255,0.20)'
  ctx.fillRect(x0, y, w, h)
  // furthest / record marker
  if (marker > 0) {
    const mx = x0 + w * Math.min(1, marker / span)
    ctx.fillStyle = '#ff5d5d'
    ctx.fillRect(mx - 1.5, y - 3, 3, h + 6)
  }
  // current car dot (white core + dark ring reads on any sky)
  const cx = x0 + w * Math.min(1, cur / span)
  ctx.beginPath()
  ctx.arc(cx, y + h / 2, dotR, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'
  ctx.lineWidth = 1.5
  ctx.stroke()
}

/** One transient HUD flash (#221 splits / #230 finish delta) — a dark pill + coloured
 *  text (green = ahead / new record, red = behind), centred under the HUD plate. */
function drawFlash(
  ctx: CanvasRenderingContext2D,
  width: number,
  flash: { text: string; ahead: boolean } | null,
  y: number,
  size: number,
): void {
  if (!flash) return
  ctx.font = `bold ${size}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  const pillW = ctx.measureText(flash.text).width + 24
  // near-opaque pill + a dark outline (halo) on every glyph, so the bright green/red
  // text stays legible over the pill AND any sky behind it (readability, invariant #1/#5).
  ctx.fillStyle = 'rgba(0,0,0,0.72)'
  ctx.fillRect((width - pillW) / 2, y - 4, pillW, size + 11)
  ctx.lineJoin = 'round'
  ctx.lineWidth = 3.5
  ctx.strokeStyle = 'rgba(0,0,0,0.9)'
  ctx.strokeText(flash.text, width / 2, y)
  ctx.fillStyle = flash.ahead ? '#5cf08a' : '#ff8f8f'
  ctx.fillText(flash.text, width / 2, y)
  ctx.textAlign = 'left'
}

export function drawScene(ctx: CanvasRenderingContext2D, s: BoxCarState): void {
  const { width, height } = s.size
  const m2px = SCALE * ZOOM
  // car sits ~32% from the left, ~60% down
  const sx = (wx: number) => (wx - s.camMX) * m2px + width * 0.32
  const sy = (wy: number) => height * 0.6 - (wy - s.camMY) * m2px

  // sky gradient — cached; only rebuilt when height or sky colour changes
  const skyKey = `${height}|${s.cfg.color.sky}`
  if (s.skyKey !== skyKey || !s.skyGradient) {
    const g = ctx.createLinearGradient(0, 0, 0, height)
    g.addColorStop(0, s.cfg.color.sky)
    g.addColorStop(1, horizonColor(s.cfg.color.sky))
    s.skyGradient = g
    s.skyKey = skyKey
  }
  ctx.fillStyle = s.skyGradient
  ctx.fillRect(0, 0, width, height)

  // parallax background (sun + clouds + distant hills) behind the terrain
  drawBackground(ctx, s)

  const ink = isLight(s.cfg.color.sky) ? 'rgba(20,24,32,0.92)' : 'rgba(255,255,255,0.92)'

  // endless terrain: sample the height function across the visible x-range.
  // Sample at FIXED world-x grid positions (snapped to RENDER_STEP) — NOT relative
  // to the moving camera — so the polyline translates rigidly as the camera scrolls
  // instead of resampling at sliding points (which makes the hills "flow"/shimmer).
  const leftW = s.camMX - (width * 0.32) / m2px - RENDER_STEP
  const rightW = s.camMX + (width * 0.68) / m2px + RENDER_STEP
  const startX = Math.floor(leftW / RENDER_STEP) * RENDER_STEP
  ctx.beginPath()
  ctx.moveTo(sx(startX), sy(s.terrainHeight(startX)))
  let lastX = startX
  for (let wx = startX + RENDER_STEP; wx <= rightW; wx += RENDER_STEP) {
    ctx.lineTo(sx(wx), sy(s.terrainHeight(wx)))
    lastX = wx
  }
  ctx.lineTo(sx(lastX), height)
  ctx.lineTo(sx(startX), height)
  ctx.closePath()
  ctx.fillStyle = s.cfg.color.terrain
  ctx.fill()

  // foreground grass tufts along the surface (scrolls with the ground)
  drawGroundDetail(ctx, s, sx, sy, startX, rightW)

  // distance markers — vertical gridlines every 25 m measured from the start, with
  // every 100 m emphasised, and a sideways meter label attached to each line.
  const MARK_STEP = 25
  const firstMark = Math.max(0, Math.ceil((leftW - s.spawnX) / MARK_STEP) * MARK_STEP)
  for (let meters = firstMark; s.spawnX + meters <= rightW; meters += MARK_STEP) {
    const px = sx(s.spawnX + meters)
    const hundred = meters % 100 === 0
    ctx.strokeStyle = hundred ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.12)'
    ctx.lineWidth = hundred ? 2.5 : 1
    ctx.beginPath()
    ctx.moveTo(px, 0)
    ctx.lineTo(px, height)
    ctx.stroke()
    // sideways label (rotated), riding alongside the line
    ctx.save()
    ctx.translate(px, height * 0.5)
    ctx.rotate(-Math.PI / 2)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = hundred ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.35)'
    ctx.font = hundred ? 'bold 16px system-ui, sans-serif' : '12px system-ui, sans-serif'
    ctx.fillText(`${meters} m`, 0, -6)
    ctx.restore()
  }

  if (s.cfg.mode === 'distance') {
    // record flag at the best distance reached so far (pole uses contrasting ink)
    const flagX = sx(s.spawnX + s.bestDistMeters)
    ctx.strokeStyle = ink
    ctx.globalAlpha = 0.5
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(flagX, 0)
    ctx.lineTo(flagX, height)
    ctx.stroke()
    ctx.globalAlpha = 1
    ctx.fillStyle = '#ff5d5d'
    ctx.beginPath()
    ctx.moveTo(flagX, 18)
    ctx.lineTo(flagX + 15, 24)
    ctx.lineTo(flagX, 30)
    ctx.closePath()
    ctx.fill()
  } else {
    // time mode: checkered finish line at the goal
    const fx = sx(s.spawnX + s.cfg.goalDistance)
    ctx.strokeStyle = ink
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(fx, 0)
    ctx.lineTo(fx, height)
    ctx.stroke()
    const sq = 10
    for (let r = 0; r * sq < height; r++) {
      for (let c = 0; c < 2; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? '#f5f7fa' : '#11161f'
        ctx.fillRect(fx + c * sq, r * sq, sq, sq)
      }
    }
    // Until any car finishes, also show the furthest-reached flag + Dist readout (#221②)
    if (!Number.isFinite(s.bestTimeSec)) drawFurthestFlag(ctx, s, sx, ink)
  }

  // rubble obstacle blocks — translucent fill + outline, in a contrasting accent
  for (const b of s.rubbleBlocks.values()) {
    const bp = getBodyPosition(b.body)
    const ba = getBodyAngle(b.body)
    const half = (b.size / 2) * m2px
    ctx.save()
    ctx.translate(sx(bp.x), sy(bp.y))
    ctx.rotate(-ba)
    ctx.fillStyle = 'rgba(231,111,81,0.22)'
    ctx.fillRect(-half, -half, half * 2, half * 2)
    ctx.strokeStyle = '#e76f51'
    ctx.lineWidth = 2
    ctx.strokeRect(-half, -half, half * 2, half * 2)
    ctx.restore()
  }

  // current car — skeletal truss: members (bars/springs) + nodes, drawn directly
  // in world space (each member spans two live node bodies; no per-body transform).
  const car = s.current
  for (const mem of car.members) {
    const pa = getBodyPosition(car.nodes[mem.a].body)
    const pb = getBodyPosition(car.nodes[mem.b].body)
    const x1 = sx(pa.x), y1 = sy(pa.y), x2 = sx(pb.x), y2 = sy(pb.y)
    if (mem.stiffness >= SPRING_THRESH) {
      ctx.strokeStyle = s.cfg.color.chassis
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
    } else {
      ctx.strokeStyle = SPRING_COLOR
      ctx.lineWidth = 2.4
      drawSpring(ctx, x1, y1, x2, y2)
    }
  }
  // nodes — small filled dots in the chassis colour
  ctx.fillStyle = s.cfg.color.chassis
  for (const nd of car.nodes) {
    const p = getBodyPosition(nd.body)
    ctx.beginPath()
    ctx.arc(sx(p.x), sy(p.y), 3.5, 0, Math.PI * 2)
    ctx.fill()
  }

  // wheels — outline circle + translucent fill + hub spoke (rotation reads)
  for (const w of car.wheels) {
    const wp = getBodyPosition(w.body)
    const wa = getBodyAngle(w.body)
    const r = w.radius * m2px
    ctx.save()
    ctx.translate(sx(wp.x), sy(wp.y))
    ctx.rotate(-wa)
    // fill tint from the palette wheel colour, but outline + spoke in contrasting
    // ink so wheels stay visible on any sky (palette wheel colours can be dark)
    ctx.fillStyle = s.cfg.color.wheel
    ctx.globalAlpha = 0.3
    ctx.beginPath()
    ctx.arc(0, 0, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.strokeStyle = ink
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.arc(0, 0, r, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(r, 0)
    ctx.stroke()
    ctx.restore()
  }

  // HUD — backing plate guarantees legibility over any sky/terrain underneath
  if (s.cfg.showHud) {
    const cp = carCentroid(car)
    const text =
      s.cfg.mode === 'time'
        ? `Gen ${s.generation}   Car ${s.carIndex + 1}/${s.cfg.population}   Time ${(s.stepsThisCar / 60).toFixed(1)}s   Best ${Number.isFinite(s.bestTimeSec) ? s.bestTimeSec.toFixed(1) + 's' : '—'}   Goal ${s.cfg.goalDistance}m`
        : `Gen ${s.generation}   Car ${s.carIndex + 1}/${s.cfg.population}   Dist ${Math.max(0, cp.x - s.spawnX).toFixed(1)}m   Best ${s.bestDistMeters.toFixed(1)}m`
    ctx.font = '14px system-ui, sans-serif'
    ctx.textBaseline = 'top'
    // centred along the top so the plate clears the config / copy-link chrome (top-left)
    const plateW = 420
    const plateX = Math.max(8, (width - plateW) / 2)
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    ctx.fillRect(plateX, 8, plateW, 26)
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.textAlign = 'center'
    ctx.fillText(text, plateX + plateW / 2, 15)
    ctx.textAlign = 'left'

    // Race feedback, part of the HUD chrome (hidden with it): the start→goal ribbon
    // (#229) and the transient finish-delta (#230) + split (#221) flashes under the plate.
    drawRibbon(ctx, s)
    drawFlash(ctx, width, s.finishFlash, 40, 17)
    drawFlash(ctx, width, s.splitFlash, 66, 14)
  }
}
