import { TRAIL_RECRUIT } from './state'

/** One colour + one strength per cell, not a field per colour: a deposit reinforces a
 *  matching cell or contests a foreign one, and reading the recruiting colour is one
 *  array read. Trails are recruitment and display only — drones pathfind to known
 *  targets, so there is no gradient-following. */
export interface Trails {
  cols: number
  rows: number
  color: Int16Array
  strength: Float32Array
}

export function makeTrails(cols: number, rows: number): Trails {
  return { cols, rows, color: new Int16Array(cols * rows).fill(-1), strength: new Float32Array(cols * rows) }
}

export function deposit(t: Trails, color: number, cell: number, amount: number): void {
  if (t.color[cell] === color || t.color[cell] === -1) {
    t.color[cell] = color
    const v = t.strength[cell] + amount
    t.strength[cell] = v > 1 ? 1 : v
    return
  }
  const v = t.strength[cell] - amount
  if (v > 0) { t.strength[cell] = v; return }
  t.color[cell] = color
  t.strength[cell] = -v > 1 ? 1 : -v
}

/** Exponential decay so `halfLife` is literally seconds-to-half. */
export function decay(t: Trails, dt: number, halfLife: number): void {
  const m = Math.exp(-dt * Math.LN2 / halfLife)
  const s = t.strength
  for (let i = 0; i < s.length; i++) s[i] *= m
}

/** The colour a blank drone standing on `cell` would adopt, or -1. */
export function recruitColor(t: Trails, cell: number): number {
  return t.strength[cell] > TRAIL_RECRUIT ? t.color[cell] : -1
}

export function clearTrails(t: Trails): void {
  t.color.fill(-1)
  t.strength.fill(0)
}
