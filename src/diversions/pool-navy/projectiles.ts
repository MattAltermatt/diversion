// Two damage models, and both are required.
//
// `cannon`, `laser` and `heavy` resolve AT FIRE TIME and cannot miss — the
// shell sprite flies only so the eye can follow it. Over a 0.54 m engagement
// at 28 m/s that is 19 ms of flight; a travel-time collision test would make a
// crossing hull almost unhittable with a turret perfectly on bearing.
//
// `missile` and `torpedo` resolve ON IMPACT and CAN miss, because a round that
// can be out-turned, or that can strike a bystander, has to be able to arrive
// somewhere other than where it was aimed.

import { MUZZLE_LIFE_SEC, SPLASH_LIFE_SEC } from './config'
import { muzzleOf, type Ship } from './ship'
import type { WeaponSpec } from './weapons'

export interface Shell {
  x: number
  y: number
  /** Muzzle, so a tracer can be drawn as the ground it has covered. */
  x0: number
  y0: number
  vx: number
  vy: number
  life: number
  kind: string
  ownerId: string
  ownerFaction: string
  /** 0 for a round already resolved at fire time. */
  damage: number
  /** Guided rounds steer toward this; '' for unguided. */
  targetId: string
  turnRateDegPerSec: number
  hitsAnyone: boolean
}

/** A held beam. Re-derived every tick, never accumulated. */
export interface Beam { x0: number; y0: number; x1: number; y1: number; faction: string }
export interface Splash { x: number; y: number; life: number }
export interface Flash { x: number; y: number; angle: number; life: number }

export interface World {
  ships: Ship[]
  shells: Shell[]
  beams: Beam[]
  splashes: Splash[]
  flashes: Flash[]
  hitRadius: number
  /**
   * ⚠️ The channel that makes the escalation rule possible. Damage is applied
   * in two places — here and on the laser path in sim.ts — and both push the
   * dead onto this queue. Without it the thing that kills ships has no way to
   * tell the thing that replaces them.
   */
  sunk: Ship[]
}

/** Apply damage after armor. Pushes to `world.sunk` if this killed the target. */
export function applyDamage(world: World, target: Ship, damage: number): boolean {
  if (!target.alive) return false
  target.hp -= damage * (1 - target.spec.armor)
  if (target.hp > 0) return false
  target.hp = 0
  // A dead hull stops being targetable immediately, not when any sinking
  // animation finishes — otherwise everyone keeps shooting a corpse.
  target.alive = false
  world.sunk.push(target)
  return true
}

/** Fire one round. Resolves immediately, or launches something that can miss. */
export function launch(world: World, shooter: Ship, target: Ship, w: WeaponSpec): void {
  // Leave the MUZZLE — the barrel tip, which rotates with the turret.
  const { x: mx, y: my } = muzzleOf(shooter)
  const dx = target.hull.x - mx
  const dy = target.hull.y - my
  const d = Math.max(1e-6, Math.hypot(dx, dy))

  world.flashes.push({ x: mx, y: my, angle: Math.atan2(dy, dx), life: MUZZLE_LIFE_SEC })

  const resolvesNow = w.lifeSec === 0
  if (resolvesNow) applyDamage(world, target, w.damage)

  world.shells.push({
    x: mx, y: my, x0: mx, y0: my,
    vx: (dx / d) * w.speedMs, vy: (dy / d) * w.speedMs,
    life: resolvesNow ? d / w.speedMs : w.lifeSec,
    kind: w.kind,
    ownerId: shooter.id,
    ownerFaction: shooter.faction,
    damage: resolvesNow ? 0 : w.damage,
    targetId: w.turnRateDegPerSec > 0 ? target.id : '',
    turnRateDegPerSec: w.turnRateDegPerSec,
    hitsAnyone: w.hitsAnyone,
  })
}

export function stepProjectiles(world: World, dt: number): void {
  const survivors: Shell[] = []

  for (const sh of world.shells) {
    if (sh.turnRateDegPerSec > 0 && sh.targetId !== '') {
      // Guided: steer the velocity toward the target, rate-limited. A hull's
      // own turn radius is 0.75 m and the missile's is 2.75 m, so a ship that
      // turns inside that genuinely escapes.
      const tgt = world.ships.find((x) => x.id === sh.targetId && x.alive)
      if (tgt) {
        const want = Math.atan2(tgt.hull.y - sh.y, tgt.hull.x - sh.x)
        const have = Math.atan2(sh.vy, sh.vx)
        let err = want - have
        while (err > Math.PI) err -= Math.PI * 2
        while (err <= -Math.PI) err += Math.PI * 2
        const max = (sh.turnRateDegPerSec * Math.PI * dt) / 180
        const a = have + Math.max(-max, Math.min(max, err))
        const spd = Math.hypot(sh.vx, sh.vy)
        sh.vx = Math.cos(a) * spd
        sh.vy = Math.sin(a) * spd
      }
    }

    sh.x += sh.vx * dt
    sh.y += sh.vy * dt
    sh.life -= dt

    if (sh.damage > 0) {
      let struck: Ship | null = null
      for (const victim of world.ships) {
        if (!victim.alive || victim.id === sh.ownerId) continue
        if (!sh.hitsAnyone && victim.faction === sh.ownerFaction) continue
        if (Math.hypot(victim.hull.x - sh.x, victim.hull.y - sh.y) <= world.hitRadius) {
          struck = victim
          break
        }
      }
      if (struck) {
        applyDamage(world, struck, sh.damage)
        world.splashes.push({ x: sh.x, y: sh.y, life: SPLASH_LIFE_SEC })
        continue
      }
    }

    if (sh.life <= 0) {
      world.splashes.push({ x: sh.x, y: sh.y, life: SPLASH_LIFE_SEC })
      continue
    }
    survivors.push(sh)
  }
  world.shells = survivors

  for (const sp of world.splashes) sp.life -= dt
  world.splashes = world.splashes.filter((sp) => sp.life > 0)
  for (const fl of world.flashes) fl.life -= dt
  world.flashes = world.flashes.filter((fl) => fl.life > 0)
}
