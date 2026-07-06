// combat.ts — the fighter combat layer (#234): aiming + magazines/reload, bullets,
// and the enrage burst that a kill injects into the nearby horde. The enrage CHAIN
// then emerges from the shoot→enrage→charge→shoot loop in the sim (a woken zombie
// charges the line, gets shot, and enrages the next pocket). Pure over Ecosystem +
// its SimConfig; zero per-step allocation (bullet pool + reused scratch).
import { DT, ZOMBIE, FIGHTER, WORLD_W, WORLD_H, BLOOD_SECONDS, type Ecosystem } from './sim'
import { insideWall } from './arena'
import { losClear } from './navField'

const HIT_R = 9 // bullet/zombie contact radius (generous → no tunnelling at bullet speed)

/** Claim a free bullet slot from the pool (rolling cursor); overwrites the oldest if
 *  the pool is momentarily full. */
function allocBullet(e: Ecosystem): number {
  const cap = e.balive.length
  for (let k = 0; k < cap; k++) {
    const idx = (e.bulletCursor + k) % cap
    if (!e.balive[idx]) { e.bulletCursor = (idx + 1) % cap; return idx }
  }
  const idx = e.bulletCursor
  e.bulletCursor = (idx + 1) % cap
  return idx
}

/** Fighter i fires a lead shot at zombie t. */
function spawnBullet(e: Ecosystem, i: number, t: number): void {
  const dx = e.px[t] - e.px[i], dy = e.py[t] - e.py[i]
  const dist = Math.hypot(dx, dy) || 1e-6
  const lead = dist / e.cfg.bulletSpeed
  let ax = e.px[t] + e.vx[t] * lead - e.px[i]
  let ay = e.py[t] + e.vy[t] * lead - e.py[i]
  const am = Math.hypot(ax, ay) || 1e-6
  const b = allocBullet(e)
  e.bx[b] = e.px[i]; e.by[b] = e.py[i]
  e.bvx[b] = (ax / am) * e.cfg.bulletSpeed
  e.bvy[b] = (ay / am) * e.cfg.bulletSpeed
  e.brange[b] = e.cfg.fighterRange * 1.35
  e.balive[b] = 1
}

/** Advance every fighter's weapon one tick: cool down, reload, or fire at the nearest
 *  in-range zombie. Assumes the hash was rebuilt on post-move positions. */
export function fireStep(e: Ecosystem): void {
  const { cfg } = e
  for (let i = 0; i < e.n; i++) {
    if (!e.alive[i] || e.faction[i] !== FIGHTER) continue
    if (e.fireT[i] > 0) e.fireT[i] -= DT
    if (e.reloadT[i] > 0) { // mid-reload: no fire until it completes
      e.reloadT[i] -= DT
      if (e.reloadT[i] <= 0) e.ammo[i] = cfg.magazine
      continue
    }
    if (e.ammo[i] <= 0) { e.reloadT[i] = cfg.reloadTime; continue } // empty → start reload
    if (e.fireT[i] > 0) continue // between shots
    // Fire at the nearest zombie in range WITH a clear line of sight — no shooting through
    // walls. A zombie behind cover is safe until it steps into view.
    e.neigh.length = 0
    e.hash.neighborsWithin(e.px, e.py, i, cfg.fighterRange, 32, e.neigh, e.faction, ZOMBIE)
    let t = -1, td2 = Infinity
    for (const j of e.neigh) {
      const dx = e.px[j] - e.px[i], dy = e.py[j] - e.py[i], d2 = dx * dx + dy * dy
      if (d2 < td2 && losClear(e.arena, e.px[i], e.py[i], e.px[j], e.py[j])) { td2 = d2; t = j }
    }
    if (t === -1) continue
    spawnBullet(e, i, t)
    e.ammo[i]--
    e.fireT[i] = cfg.fireCooldown
  }
}

/** Move every live bullet, expire on range/bounds, and on a zombie hit: kill it and
 *  enrage the surrounding horde. Returns the number of zombies killed this step (for
 *  the settle clock). */
export function bulletStep(e: Ecosystem): number {
  const cap = e.balive.length
  let kills = 0
  for (let b = 0; b < cap; b++) {
    if (!e.balive[b]) continue
    e.bx[b] += e.bvx[b] * DT
    e.by[b] += e.bvy[b] * DT
    e.brange[b] -= Math.hypot(e.bvx[b], e.bvy[b]) * DT
    if (e.brange[b] <= 0 || e.bx[b] < 0 || e.bx[b] > WORLD_W || e.by[b] < 0 || e.by[b] > WORLD_H) {
      e.balive[b] = 0; continue
    }
    if (insideWall(e.arena, e.bx[b], e.by[b])) { e.balive[b] = 0; continue } // bullets stop at walls
    const z = e.hash.nearestAtPoint(e.px, e.py, e.bx[b], e.by[b], HIT_R, e.alive, e.faction, ZOMBIE)
    if (z !== -1) {
      // Enrage burst: every zombie near the kill flips fear→charge.
      e.neigh.length = 0
      e.hash.neighborsWithin(e.px, e.py, z, e.cfg.enrageRadius, 48, e.neigh, e.faction, ZOMBIE)
      for (const nb of e.neigh) {
        if (e.alive[nb] && e.enrageT[nb] < e.cfg.enrageTime) e.enrageT[nb] = e.cfg.enrageTime
      }
      e.alive[z] = 0
      e.enrageT[z] = 0
      e.balive[b] = 0
      // Blood mark (#236): a fading death blotch at the kill site, rolling pool.
      const bc = e.bloodCursor
      e.dbx[bc] = e.px[z]; e.dby[bc] = e.py[z]; e.dbt[bc] = BLOOD_SECONDS
      e.bloodCursor = (bc + 1) % e.dbt.length
      kills++
    }
  }
  return kills
}
