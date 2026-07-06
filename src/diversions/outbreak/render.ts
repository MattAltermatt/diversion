// render.ts — draw one frame. Cover-fits the fixed 1600×900 world into the CSS-pixel
// canvas, paints the arena + each faction (batched, one fillStyle per faction), then the
// #236 juice layer: fading blood marks, infection countdown rings, tracers + muzzle
// flashes, and a screen-space population HUD with a win banner on resolve.
import { type Ecosystem, CIVILIAN, FIGHTER, ZOMBIE, WORLD_W, WORLD_H, INFECT_DELAY, BLOOD_SECONDS } from './sim'
import type { OutbreakConfig } from './schema'
import type { Size } from '../../framework/types'

const TAU = Math.PI * 2

export function drawScene(
  ctx: CanvasRenderingContext2D, e: Ecosystem, cfg: OutbreakConfig, size: Size,
): void {
  ctx.fillStyle = cfg.background
  ctx.fillRect(0, 0, size.width, size.height)

  // Contain-fit: the whole arena always fits inside the canvas (centered, letterboxed
  // into the background) rather than cover-cropping agents past the visible edges.
  const scale = Math.min(size.width / WORLD_W, size.height / WORLD_H)
  const ox = (size.width - WORLD_W * scale) / 2
  const oy = (size.height - WORLD_H * scale) / 2
  const r = Math.max(0.8, cfg.agentRadius * scale)

  // Arena: maze walls drawn translucent (so a bite / last-stand behind a corner stays
  // legible under the whole-arena view) with a faint solid outline to keep the walls
  // reading as structure. A border frames the bounds even in an open field.
  ctx.fillStyle = cfg.wallColor
  ctx.globalAlpha = 0.5
  for (const w of e.arena.walls) {
    ctx.fillRect(ox + w.x * scale, oy + w.y * scale, w.w * scale, w.h * scale)
  }
  ctx.globalAlpha = 1
  ctx.strokeStyle = cfg.wallColor
  ctx.lineWidth = Math.max(0.5, scale)
  for (const w of e.arena.walls) {
    ctx.strokeRect(ox + w.x * scale, oy + w.y * scale, w.w * scale, w.h * scale)
  }
  ctx.lineWidth = Math.max(1, scale * 2)
  ctx.strokeRect(ox, oy, WORLD_W * scale, WORLD_H * scale)

  // ── Blood marks (#236): fading death blotches beneath the crowd — the battle history.
  const { dbx, dby, dbt } = e
  ctx.fillStyle = '#7a1512'
  for (let k = 0; k < dbt.length; k++) {
    const t = dbt[k]
    if (t <= 0) continue
    ctx.globalAlpha = (t / BLOOD_SECONDS) * 0.45
    const x = ox + dbx[k] * scale, y = oy + dby[k] * scale
    ctx.beginPath()
    ctx.arc(x, y, r * 1.7, 0, TAU)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  const paint = (want: number, color: string) => {
    ctx.fillStyle = color
    ctx.beginPath()
    const { px, py, faction, alive } = e
    for (let i = 0; i < e.n; i++) {
      if (!alive[i] || faction[i] !== want) continue
      const x = ox + px[i] * scale, y = oy + py[i] * scale
      ctx.moveTo(x + r, y)
      ctx.arc(x, y, r, 0, TAU)
    }
    ctx.fill()
  }

  // Civilians first (the crowd), then the two armies on top so they read.
  paint(CIVILIAN, cfg.civilianColor)
  paint(FIGHTER, cfg.fighterColor)
  paint(ZOMBIE, cfg.zombieColor)

  // ── Infection countdown rings (#236): a bitten agent keeps its behaviour while a ring
  // shrinks from a wide halo down to the body, pulsing, then it flips to a zombie. Reads
  // as "turning" without changing the agent's colour until the timer fires.
  const { px, py, infecting, infectTimer, alive } = e
  ctx.strokeStyle = cfg.zombieColor
  ctx.lineWidth = Math.max(1, scale * 1.3)
  const pulse = 0.6 + 0.4 * Math.sin(e.simTime * 14)
  for (let i = 0; i < e.n; i++) {
    if (!alive[i] || !infecting[i]) continue
    const frac = infectTimer[i] / INFECT_DELAY // 1 → 0 as it turns
    const rr = r + r * 2.6 * frac // wide halo shrinking to the body
    ctx.globalAlpha = (0.3 + 0.55 * (1 - frac)) * pulse // brightens as the flip nears
    const x = ox + px[i] * scale, y = oy + py[i] * scale
    ctx.beginPath()
    ctx.arc(x, y, rr, 0, TAU)
    ctx.stroke()
  }
  ctx.globalAlpha = 1

  // ── Tracers (#236): each live bullet is a bright streak from just behind it to its
  // head — the firing line reads as gunfire, not floating dots.
  const { bx, by, bvx, bvy, balive } = e
  ctx.strokeStyle = '#ffe9a0'
  ctx.lineWidth = Math.max(1, scale * 1.2)
  ctx.beginPath()
  for (let b = 0; b < balive.length; b++) {
    if (!balive[b]) continue
    const x = ox + bx[b] * scale, y = oy + by[b] * scale
    const tx = ox + (bx[b] - bvx[b] * 0.03) * scale, ty = oy + (by[b] - bvy[b] * 0.03) * scale
    ctx.moveTo(tx, ty); ctx.lineTo(x, y)
  }
  ctx.stroke()

  // ── Muzzle flashes (#236): a fighter that fired within the last instant (fireT near the
  // top of its cooldown) shows a warm flash dot — derived from combat state, no pool.
  const flashWindow = 0.05
  const cooldownTop = e.cfg.fireCooldown - flashWindow
  const { faction, fireT } = e
  ctx.fillStyle = '#fff2b0'
  ctx.beginPath()
  let anyFlash = false
  for (let i = 0; i < e.n; i++) {
    if (!alive[i] || faction[i] !== FIGHTER || fireT[i] < cooldownTop) continue
    const x = ox + px[i] * scale, y = oy + py[i] * scale
    ctx.moveTo(x + r * 1.5, y)
    ctx.arc(x, y, r * 1.5, 0, TAU)
    anyFlash = true
  }
  if (anyFlash) ctx.fill()

  if (cfg.showHud) drawHud(ctx, e, cfg, size)
}

/** Screen-space population HUD (#236): a stacked bar of the living population (civilians
 *  / fighters / horde — the who-is-winning gauge) with counts, plus a centred win banner
 *  while the resolved tableau is held. */
function drawHud(ctx: CanvasRenderingContext2D, e: Ecosystem, cfg: OutbreakConfig, size: Size): void {
  const civ = e.civAlive, fig = e.fighterAlive, zom = e.zombieAlive
  const total = civ + fig + zom
  if (total <= 0) return

  // Anchored top-centre — between the toolbar (top-left) and the fps chip (top-right).
  const pad = Math.round(Math.min(size.width, size.height) * 0.03)
  const barW = Math.min(size.width * 0.44, Math.max(220, size.width * 0.3))
  const barH = Math.max(10, Math.round(size.height * 0.018))
  const fs = Math.max(11, Math.round(size.height * 0.02))
  const x0 = Math.round((size.width - barW) / 2)
  const y0 = pad

  // track + stacked segments: civilians → fighters → horde
  ctx.globalAlpha = 1
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.fillRect(x0 - 2, y0 - 2, barW + 4, barH + 4)
  let x = x0
  const seg = (count: number, color: string) => {
    const w = (count / total) * barW
    if (w <= 0) return
    ctx.fillStyle = color
    ctx.fillRect(x, y0, w, barH)
    x += w
  }
  seg(civ, cfg.civilianColor)
  seg(fig, cfg.fighterColor)
  seg(zom, cfg.zombieColor)

  // counts label, centred below the bar
  ctx.font = `600 ${fs}px ui-sans-serif, system-ui, sans-serif`
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  const parts: [string, string][] = [
    [`◻ ${civ}`, cfg.civilianColor], [`▲ ${fig}`, cfg.fighterColor], [`● ${zom}`, cfg.zombieColor],
  ]
  const gap = fs * 0.9
  let totalW = 0
  for (const [t] of parts) totalW += ctx.measureText(t).width
  totalW += gap * (parts.length - 1)
  const ly = y0 + barH + Math.round(fs * 0.4)
  let lx = x0 + (barW - totalW) / 2
  for (const [t, color] of parts) {
    ctx.fillStyle = color
    ctx.fillText(t, lx, ly)
    lx += ctx.measureText(t).width + gap
  }

  // ── Win banner while the resolved tableau is held.
  if (e.outcome !== null) {
    const won = e.outcome === 'humans'
    const text = won ? 'HUMANS HOLD' : 'THE HORDE WINS'
    const bf = Math.max(28, Math.round(size.height * 0.07))
    ctx.font = `800 ${bf}px ui-sans-serif, system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const cx = size.width / 2, cy = size.height / 2
    const tw = ctx.measureText(text).width
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(cx - tw / 2 - bf * 0.6, cy - bf * 0.85, tw + bf * 1.2, bf * 1.7)
    ctx.fillStyle = won ? cfg.fighterColor : cfg.zombieColor
    ctx.fillText(text, cx, cy)
    ctx.textAlign = 'left' // restore for the next frame's HUD
  }
}
