// Toy-vector view: flat pool blue with a faint tile grid, filled wedge hulls
// in faction colours, visible turret stubs, tapering wakes, white splashes.
// Drawn entirely in code.
//
// ⚠️ `globalAlpha` is sticky state and a per-item loop leaks it: draws that do
// not set it inherit the PREVIOUS item's value, so only item 0 is right — and
// with a pool whose membership reshuffles, the brightness flickers. EVERY path
// here sets it explicitly, including back to 1.

import { MUZZLE_LIFE_SEC, SPLASH_LIFE_SEC, speedScale } from './config'
import { factionColor, factionDark } from './palette'
import type { Ship } from './ship'
import type { PoolNavyState } from './sim'

const TILE_M = 0.5

export function render(state: PoolNavyState, ctx: CanvasRenderingContext2D): void {
  const { cfg, scale, offsetX, offsetY, size } = state
  const px = (m: number): number => m * scale
  const X = (m: number): number => offsetX + m * scale
  const Y = (m: number): number => offsetY + m * scale

  ctx.globalAlpha = 1
  // ⚠️ Reset lineCap too. It is sticky context state exactly like globalAlpha:
  // the tracer and flash paths set 'round' and nothing restored it, so from
  // the first shot onward the wakes, beams, hulls and splashes silently drew
  // with round caps forever — the opening seconds rendered differently from
  // every second after.
  ctx.lineCap = 'butt'
  // The letterbox, so a non-16:9 canvas does not show stale pixels.
  ctx.fillStyle = '#08131b'
  ctx.fillRect(0, 0, size.width, size.height)

  const w = px(cfg.poolWidthM)
  const h = px(cfg.poolHeightM)
  ctx.fillStyle = cfg.background
  ctx.fillRect(offsetX, offsetY, w, h)

  ctx.globalAlpha = 0.22
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let x = 0; x <= cfg.poolWidthM + 1e-6; x += TILE_M) {
    ctx.moveTo(X(x), offsetY)
    ctx.lineTo(X(x), offsetY + h)
  }
  for (let y = 0; y <= cfg.poolHeightM + 1e-6; y += TILE_M) {
    ctx.moveTo(offsetX, Y(y))
    ctx.lineTo(offsetX + w, Y(y))
  }
  ctx.stroke()

  ctx.globalAlpha = 1
  ctx.strokeStyle = '#e8f4fb'
  ctx.lineWidth = Math.max(2, px(0.03))
  ctx.strokeRect(offsetX, offsetY, w, h)

  if (cfg.showWakes) drawWakes(state, ctx, px, X, Y)
  drawFlashes(state, ctx, X, Y)
  drawTracers(state, ctx, px, X, Y)
  drawBeams(state, ctx, px, X, Y)
  drawHulls(state, ctx, px, X, Y)
  drawSplashes(state, ctx, px, X, Y)

  ctx.globalAlpha = 1
}

type Px = (m: number) => number

function drawWakes(s: PoolNavyState, ctx: CanvasRenderingContext2D, px: Px, X: Px, Y: Px): void {
  for (const ship of s.ships) {
    const t = ship.trail
    if (t.length < 2) continue
    // Wake brightness tracks condition, so a limping hull leaves a short
    // stubby track beside a healthy one's long clean arc.
    const fade = speedScale(ship.hp / ship.spec.hp, s.cfg.limpSpeed)
    for (let i = 1; i < t.length; i++) {
      const f = i / t.length
      ctx.globalAlpha = 0.55 * f * fade
      ctx.strokeStyle = '#dff1fd'
      ctx.lineWidth = Math.max(1, px(ship.spec.beamM) * 0.8 * f)
      ctx.beginPath()
      ctx.moveTo(X(t[i - 1]!.x), Y(t[i - 1]!.y))
      ctx.lineTo(X(t[i]!.x), Y(t[i]!.y))
      ctx.stroke()
    }
  }
}

function drawFlashes(s: PoolNavyState, ctx: CanvasRenderingContext2D, X: Px, Y: Px): void {
  for (const fl of s.flashes) {
    const a = fl.life / MUZZLE_LIFE_SEC
    ctx.globalAlpha = 0.95 * a
    ctx.strokeStyle = '#ffecaa'
    ctx.lineWidth = 3.2 * a + 0.8
    ctx.lineCap = 'round'
    const len = 0.07 * (0.4 + 0.6 * a)
    ctx.beginPath()
    ctx.moveTo(X(fl.x), Y(fl.y))
    ctx.lineTo(X(fl.x + Math.cos(fl.angle) * len), Y(fl.y + Math.sin(fl.angle) * len))
    ctx.stroke()
  }
}

/**
 * Tracers are drawn as the GROUND COVERED, not as a point.
 *
 * Measured: a shell is on screen for 1.9 rendered frames and moves 49 px
 * between them. A 1.8 px dot at that rate is a strobe; a streak from the
 * muzzle to the current position is continuous and ~13x the ink.
 */
function drawTracers(s: PoolNavyState, ctx: CanvasRenderingContext2D, px: Px, X: Px, Y: Px): void {
  ctx.lineCap = 'round'
  for (const sh of s.shells) {
    const hx = X(sh.x)
    const hy = Y(sh.y)
    const ang = Math.atan2(sh.vy, sh.vx)

    // Slow, physical ordnance is drawn as an OBJECT with a wake. Fast rounds
    // are drawn as the ground they covered — measured at 1.9 rendered frames
    // and 49 px of travel between them, a point strobes and a streak does not.
    if (sh.kind === 'torpedo') { drawTorpedo(ctx, px, X, Y, sh.x, sh.y, sh.x0, sh.y0, ang); continue }
    if (sh.kind === 'depthCharge') { drawDrum(ctx, px, hx, hy, sh.life); continue }
    if (sh.kind === 'mortar') { drawMortar(ctx, px, hx, hy, sh.life); continue }

    const grad = ctx.createLinearGradient(X(sh.x0), Y(sh.y0), hx, hy)
    grad.addColorStop(0, 'rgba(255,243,196,0.05)')
    grad.addColorStop(1, 'rgba(255,248,222,0.95)')
    ctx.globalAlpha = 1
    ctx.strokeStyle = grad
    ctx.lineWidth = sh.kind === 'railgun' ? 3 : sh.kind === 'flak' ? 1.3 : 2.2
    ctx.beginPath()
    ctx.moveTo(X(sh.x0), Y(sh.y0))
    ctx.lineTo(hx, hy)
    ctx.stroke()
    ctx.fillStyle = sh.kind === 'railgun' ? '#cfefff' : '#fffbe8'
    ctx.beginPath()
    ctx.arc(hx, hy, sh.damage > 0 ? 3 : 2.4, 0, Math.PI * 2)
    ctx.fill()
  }
}

/**
 * A torpedo is an object in the water, not a tracer: a dark cigar hull with a
 * rounded nose, a bright churned wake behind it, and a faint track back to
 * where it was launched. It travels at 0.9 m/s — slow enough to watch, which
 * is the whole point of it being the weapon that can hit a bystander.
 */
function drawTorpedo(
  ctx: CanvasRenderingContext2D, px: Px, X: Px, Y: Px,
  x: number, y: number, x0: number, y0: number, ang: number,
): void {
  // The track it has already run.
  ctx.globalAlpha = 0.28
  ctx.strokeStyle = '#dff1fd'
  ctx.lineWidth = Math.max(1, px(0.012))
  ctx.beginPath()
  ctx.moveTo(X(x0), Y(y0))
  ctx.lineTo(X(x), Y(y))
  ctx.stroke()

  const L = px(0.085)
  const W = px(0.03)
  const cx = X(x)
  const cy = Y(y)
  const c = Math.cos(ang)
  const sn = Math.sin(ang)

  // Churn at the screws.
  ctx.globalAlpha = 0.7
  ctx.fillStyle = '#eaf6ff'
  ctx.beginPath()
  ctx.arc(cx - c * L * 0.75, cy - sn * L * 0.75, W * 0.8, 0, Math.PI * 2)
  ctx.fill()

  // Body: blunt tail, rounded nose.
  ctx.globalAlpha = 1
  ctx.fillStyle = '#20303c'
  ctx.beginPath()
  const body: Array<[number, number]> = [
    [L * 0.5, 0], [L * 0.22, -W * 0.5], [-L * 0.5, -W * 0.42],
    [-L * 0.5, W * 0.42], [L * 0.22, W * 0.5],
  ]
  body.forEach(([bx, by], i) => {
    const wx = cx + bx * c - by * sn
    const wy = cy + bx * sn + by * c
    if (i === 0) ctx.moveTo(wx, wy)
    else ctx.lineTo(wx, wy)
  })
  ctx.closePath()
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.strokeStyle = '#8fd2ff'
  ctx.lineWidth = 1
  ctx.stroke()
}

/** A depth charge: a drum that drifts and arms, pulsing as it nears its time. */
function drawDrum(ctx: CanvasRenderingContext2D, px: Px, hx: number, hy: number, life: number): void {
  const pulse = 0.5 + 0.5 * Math.sin(life * 14)
  ctx.globalAlpha = 1
  ctx.fillStyle = '#2b2f33'
  ctx.beginPath()
  ctx.arc(hx, hy, Math.max(2.5, px(0.028)), 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 0.35 + 0.55 * pulse
  ctx.strokeStyle = '#ff9f4a'
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.arc(hx, hy, Math.max(4, px(0.045)), 0, Math.PI * 2)
  ctx.stroke()
}

/** A mortar bomb, lobbed: it rises and falls, so it is drawn with a shadow. */
function drawMortar(ctx: CanvasRenderingContext2D, px: Px, hx: number, hy: number, life: number): void {
  const arc = Math.sin(Math.max(0, Math.min(1, 1 - life / 1.25)) * Math.PI)
  const lift = px(0.12) * arc
  ctx.globalAlpha = 0.3
  ctx.fillStyle = '#04141f'
  ctx.beginPath()
  ctx.ellipse(hx, hy, Math.max(2, px(0.02)), Math.max(1.2, px(0.012)), 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.fillStyle = '#3a4550'
  ctx.beginPath()
  ctx.arc(hx, hy - lift, Math.max(2.2, px(0.022)), 0, Math.PI * 2)
  ctx.fill()
}

function drawBeams(s: PoolNavyState, ctx: CanvasRenderingContext2D, px: Px, X: Px, Y: Px): void {
  for (const b of s.beams) {
    ctx.globalAlpha = 0.85
    ctx.strokeStyle = '#bff3ff'
    ctx.lineWidth = Math.max(1.2, px(0.012))
    ctx.beginPath()
    ctx.moveTo(X(b.x0), Y(b.y0))
    ctx.lineTo(X(b.x1), Y(b.y1))
    ctx.stroke()
  }
}

function drawHulls(s: PoolNavyState, ctx: CanvasRenderingContext2D, px: Px, X: Px, Y: Px): void {
  for (const ship of s.ships) {
    const L = px(ship.spec.lengthM)
    const B = px(ship.spec.beamM)
    const c = Math.cos(ship.hull.heading)
    const sn = Math.sin(ship.hull.heading)
    const sx = X(ship.hull.x)
    const sy = Y(ship.hull.y)

    // Explicit, and currently redundant: every upstream path happens to leave
    // alpha at 1, so removing this line changes nothing TODAY and no failing
    // case can be constructed for it. It stays because the redundancy is the
    // whole policy — the moment any earlier draw ends on a partial alpha, the
    // hull fill would silently inherit it and only ship 0 would be right.
    ctx.globalAlpha = 1
    ctx.beginPath()
    const pts: Array<[number, number]> = [
      [L * 0.5, 0], [L * 0.18, -B * 0.5], [-L * 0.5, -B * 0.42],
      [-L * 0.5, B * 0.42], [L * 0.18, B * 0.5],
    ]
    pts.forEach(([hx, hy], i) => {
      const x = sx + hx * c - hy * sn
      const y = sy + hx * sn + hy * c
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.closePath()
    ctx.fillStyle = factionColor(ship.factionIndex, s.cfg.palette, s.cfg.background)
    ctx.fill()
    ctx.strokeStyle = factionDark(ship.factionIndex, s.cfg.palette, s.cfg.background)
    ctx.lineWidth = Math.max(1, B * 0.14)
    ctx.stroke()

    drawTurret(ship, ctx, sx, sy, c, sn, L, B)
    drawHpBar(ship, ctx, sx, sy, L, B)
  }
}

function drawTurret(
  ship: Ship, ctx: CanvasRenderingContext2D,
  sx: number, sy: number, c: number, sn: number, L: number, B: number,
): void {
  const along = 0.25 * L * 0.5
  const bx = sx + along * c
  const by = sy + along * sn
  const stub = Math.max(2.5, B * 0.45)
  ctx.globalAlpha = 1
  ctx.fillStyle = '#1c2733'
  ctx.beginPath()
  ctx.arc(bx, by, stub, 0, Math.PI * 2)
  ctx.fill()
  const bearing = ship.hull.heading + ship.turretBearing
  ctx.strokeStyle = '#1c2733'
  ctx.lineWidth = Math.max(1.5, stub * 0.6)
  ctx.beginPath()
  ctx.moveTo(bx, by)
  ctx.lineTo(bx + Math.cos(bearing) * stub * 2.8, by + Math.sin(bearing) * stub * 2.8)
  ctx.stroke()
}

/**
 * Condition bar.
 *
 * ⚠️ Two defects fixed here, both worst exactly where the piece is most often
 * seen. At gallery-tile scale a hull is 10.5 px, and the old `Math.max(18, …)`
 * floor drew a bar 1.7x the boat's own LENGTH on a black plate — the bars were
 * the dominant object and the boats read as specks beneath a bar chart. And
 * the fill colours were byte-identical to `DEFAULTS.palette[2]` and `[0]`, so
 * the loudest coloured things on the tile looked exactly like faction colours
 * while carrying no faction information at all.
 *
 * Now: it scales with the hull, and vanishes entirely once a hull is too small
 * for it to mean anything. The colours are deliberately off-palette neutrals.
 */
function drawHpBar(
  ship: Ship, ctx: CanvasRenderingContext2D, sx: number, sy: number, L: number, B: number,
): void {
  if (ship.hp >= ship.spec.hp) return
  // Below this the bar is bigger than the information it carries.
  if (L < 22) return
  const w = L * 0.8
  const frac = Math.max(0, ship.hp / ship.spec.hp)
  const h = Math.max(1.5, L * 0.05)
  const yy = sy - B - h * 2.4
  ctx.globalAlpha = 0.35
  ctx.fillStyle = '#04141f'
  ctx.fillRect(sx - w / 2 - 1, yy - 1, w + 2, h + 2)
  ctx.globalAlpha = 0.9
  ctx.fillStyle = frac > 0.35 ? '#dfe8ec' : '#8c99a3'
  ctx.fillRect(sx - w / 2, yy, w * frac, h)
}

function drawSplashes(s: PoolNavyState, ctx: CanvasRenderingContext2D, px: Px, X: Px, Y: Px): void {
  for (const sp of s.splashes) {
    const a = sp.life / SPLASH_LIFE_SEC
    const r = px(0.018 + 0.055 * (1 - a))
    ctx.globalAlpha = 0.9 * a * a
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1 + 2.2 * a
    ctx.beginPath()
    ctx.arc(X(sp.x), Y(sp.y), r, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha = 0.75 * a * a
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(X(sp.x), Y(sp.y), 2.2 * a + 0.6, 0, Math.PI * 2)
    ctx.fill()
  }
}
