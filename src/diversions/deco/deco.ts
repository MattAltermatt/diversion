import { mulberry32 } from '../../framework/rng'
import type { DecoConfig } from './schema'

const DEPTH_DUR = 0.55 // seconds (at speed 1) between successive subdivision depths
const STAGGER = 0.5    // random spread within a depth so splits pop in one by one
const MIN_SIZE = 18    // px — stop subdividing below this
const EARLY_STOP = 0.12 // chance a branch stops early → varied rectangle sizes

export type DecoNode = {
  x: number
  y: number
  w: number
  h: number
  color: string
  revealAt: number // seconds (at speed 1) when this node splits into its children
  a: DecoNode | null
  b: DecoNode | null
}

function ratioFor(split: string, rng: () => number): number {
  if (split === 'Halve') return 0.5
  if (split === 'Mixed') return 0.3 + rng() * 0.4
  return rng() < 0.5 ? 0.382 : 0.618 // Golden
}

/** Recursively subdivide a rectangle into a tree; each internal node records when
 *  its split should reveal (deeper = later, with a stagger). */
export function buildTree(
  x: number, y: number, w: number, h: number, depth: number,
  cfg: DecoConfig, rng: () => number,
): DecoNode {
  const palette = cfg.palette
  const color = palette[(rng() * palette.length) | 0]
  const node: DecoNode = { x, y, w, h, color, revealAt: depth * DEPTH_DUR + rng() * STAGGER, a: null, b: null }
  const leaf = depth >= cfg.depth || Math.min(w, h) < MIN_SIZE || (depth >= 2 && rng() < EARLY_STOP)
  if (leaf) return node
  const r = ratioFor(cfg.split, rng)
  if (w >= h) {
    const wa = Math.round(w * r)
    node.a = buildTree(x, y, wa, h, depth + 1, cfg, rng)
    node.b = buildTree(x + wa, y, w - wa, h, depth + 1, cfg, rng)
  } else {
    const ha = Math.round(h * r)
    node.a = buildTree(x, y, w, ha, depth + 1, cfg, rng)
    node.b = buildTree(x, y + ha, w, h - ha, depth + 1, cfg, rng)
  }
  return node
}

/** Latest reveal time in the tree — when the composition is fully built. */
export function maxReveal(node: DecoNode): number {
  if (node.a === null) return 0
  return Math.max(node.revealAt, maxReveal(node.a), maxReveal(node.b!))
}

export type DecoState = {
  cfg: DecoConfig
  w: number
  h: number
  root: DecoNode
  done: number // time (at speed 1) the build completes
  t: number    // elapsed reveal time (advances at cfg.speed)
}

export function createDecoState(cfg: DecoConfig, w: number, h: number): DecoState {
  const root = buildTree(0, 0, w, h, 0, cfg, mulberry32(cfg.seed))
  return { cfg, w, h, root, done: maxReveal(root), t: 0 }
}

/** Rebuild the tree in place (a resize, a structural config edit, or a recolor).
 *  The fresh-cycle reseed is owned by the framework via `shouldRestart` (which
 *  rolls a new seed + re-runs setup), so this always uses the current seed. */
export function rebuild(st: DecoState, resetClock: boolean): void {
  st.root = buildTree(0, 0, st.w, st.h, 0, st.cfg, mulberry32(st.cfg.seed))
  st.done = maxReveal(st.root)
  if (resetClock) st.t = 0
}

function drawNode(ctx: CanvasRenderingContext2D, node: DecoNode, t: number, bw: number): void {
  if (node.a === null || t < node.revealAt) {
    const iw = node.w - bw
    const ih = node.h - bw
    if (iw > 0 && ih > 0) {
      ctx.fillStyle = node.color
      ctx.fillRect(node.x + bw / 2, node.y + bw / 2, iw, ih)
    }
    return
  }
  drawNode(ctx, node.a, t, bw)
  drawNode(ctx, node.b!, t, bw)
}

export function renderDeco(st: DecoState, ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = st.cfg.border
  ctx.fillRect(0, 0, st.w, st.h) // border color shows through the inset gaps
  drawNode(ctx, st.root, st.t, st.cfg.borderWidth)
}
