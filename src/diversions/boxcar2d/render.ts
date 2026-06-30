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
    g.addColorStop(1, '#05060a')
    s.skyGradient = g
    s.skyKey = skyKey
  }
  ctx.fillStyle = s.skyGradient
  ctx.fillRect(0, 0, width, height)

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

  // current car — wireframe: translucent fill + centre spokes + outline
  const car = s.current
  const cp = getBodyPosition(car.chassis)
  const ca = getBodyAngle(car.chassis)
  ctx.save()
  ctx.translate(sx(cp.x), sy(cp.y))
  ctx.rotate(-ca) // Box2D CCW Y-up → canvas CW Y-down
  // chassis outline path
  ctx.beginPath()
  for (let i = 0; i < car.verts.length; i++) {
    const vx = car.verts[i].x * m2px
    const vy = -car.verts[i].y * m2px
    if (i === 0) ctx.moveTo(vx, vy)
    else ctx.lineTo(vx, vy)
  }
  ctx.closePath()
  ctx.fillStyle = s.cfg.color.chassis
  ctx.globalAlpha = 0.16
  ctx.fill()
  ctx.globalAlpha = 1
  // spokes from the body centre to each vertex (shows the structure)
  ctx.strokeStyle = s.cfg.color.chassis
  ctx.lineWidth = 1.5
  for (let i = 0; i < car.verts.length; i++) {
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(car.verts[i].x * m2px, -car.verts[i].y * m2px)
    ctx.stroke()
  }
  // chassis outline
  ctx.beginPath()
  for (let i = 0; i < car.verts.length; i++) {
    const vx = car.verts[i].x * m2px
    const vy = -car.verts[i].y * m2px
    if (i === 0) ctx.moveTo(vx, vy)
    else ctx.lineTo(vx, vy)
  }
  ctx.closePath()
  ctx.lineWidth = 2.5
  ctx.stroke()
  ctx.restore()

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
  }
}
