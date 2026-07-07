export type FieldKind = 'square' | 'hexagon' | 'triangle'

export interface Tessellation {
  cellCount: number
  cols: number
  rows: number
  degree: number
  nbrStart: Int32Array
  nbrIdx: Int32Array
  fillCell(ctx: CanvasRenderingContext2D, i: number, fillStyle: string): void
}

/** Build CSR neighbor arrays from a per-cell adjacency list. */
function toCSR(lists: number[][]): { nbrStart: Int32Array; nbrIdx: Int32Array } {
  const n = lists.length
  const nbrStart = new Int32Array(n + 1)
  for (let i = 0; i < n; i++) nbrStart[i + 1] = nbrStart[i] + lists[i].length
  const nbrIdx = new Int32Array(nbrStart[n])
  let p = 0
  for (let i = 0; i < n; i++) for (const nb of lists[i]) nbrIdx[p++] = nb
  return { nbrStart, nbrIdx }
}

const SQUARE_DELTAS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const

function buildSquare(cs: number, W: number, H: number): Tessellation {
  const cols = Math.max(1, Math.floor(W / cs))
  const rows = Math.max(1, Math.floor(H / cs))
  const id = (c: number, r: number) => r * cols + c
  const lists: number[][] = []
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const nb: number[] = []
    for (const [dc, dr] of SQUARE_DELTAS) {
      const nc = c + dc, nr = r + dr
      if (nc >= 0 && nc < cols && nr >= 0 && nr < rows) nb.push(id(nc, nr))
    }
    lists.push(nb)
  }
  const { nbrStart, nbrIdx } = toCSR(lists)
  // +0.75 overlap defeats sub-pixel seams under DPR scaling.
  const span = cs + 0.75
  return {
    cellCount: cols * rows, cols, rows, degree: 4, nbrStart, nbrIdx,
    fillCell(ctx, i, fillStyle) {
      const c = i % cols, r = (i / cols) | 0
      ctx.fillStyle = fillStyle
      ctx.fillRect(c * cs, r * cs, span, span)
    },
  }
}

// odd-r offset (pointy-top, odd rows shifted +x). Per-row-parity neighbor deltas.
const HEX_DELTAS = [
  [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]],   // even rows
  [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]],     // odd rows
] as const

function buildHexagon(size: number, W: number, H: number): Tessellation {
  const hexW = Math.sqrt(3) * size   // horizontal spacing
  const hexV = 1.5 * size            // vertical spacing
  const cols = Math.max(1, Math.floor((W - hexW / 2) / hexW))
  const rows = Math.max(1, Math.floor((H - size / 2) / hexV))
  const id = (c: number, r: number) => r * cols + c
  const lists: number[][] = []
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const nb: number[] = []
    for (const [dc, dr] of HEX_DELTAS[r & 1]) {
      const nc = c + dc, nr = r + dr
      if (nc >= 0 && nc < cols && nr >= 0 && nr < rows) nb.push(id(nc, nr))
    }
    lists.push(nb)
  }
  const { nbrStart, nbrIdx } = toCSR(lists)
  const cx = (c: number, r: number) => hexW * c + hexW * 0.5 * (r & 1) + hexW / 2
  const cy = (r: number) => size + hexV * r
  // Vertex offsets are identical for every hexagon — precompute the six (dx,dy)
  // once instead of 12 trig ops per cell paint (fillCell runs per changed cell).
  const hx = new Float64Array(6), hy = new Float64Array(6)
  for (let k = 0; k < 6; k++) {
    const a = ((-90 + 60 * k) * Math.PI) / 180
    hx[k] = size * Math.cos(a); hy[k] = size * Math.sin(a)
  }
  return {
    cellCount: cols * rows, cols, rows, degree: 6, nbrStart, nbrIdx,
    fillCell(ctx, i, fillStyle) {
      const c = i % cols, r = (i / cols) | 0
      const x = cx(c, r), y = cy(r)
      ctx.fillStyle = fillStyle
      ctx.beginPath()
      ctx.moveTo(x + hx[0], y + hy[0])
      for (let k = 1; k < 6; k++) ctx.lineTo(x + hx[k], y + hy[k])
      ctx.closePath()
      ctx.fill()
    },
  }
}

function buildTriangle(cs: number, W: number, H: number): Tessellation {
  const half = cs / 2
  const h = (cs * Math.sqrt(3)) / 2
  const cols = Math.max(1, Math.floor(W / half) - 1)
  const rows = Math.max(1, Math.floor(H / h))
  const id = (c: number, r: number) => r * cols + c
  const up = (c: number, r: number) => ((c + r) & 1) === 0
  const lists: number[][] = []
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const nb: number[] = []
    const cand: Array<[number, number]> = up(c, r)
      ? [[c - 1, r], [c + 1, r], [c, r + 1]]
      : [[c - 1, r], [c + 1, r], [c, r - 1]]
    for (const [nc, nr] of cand) {
      if (nc >= 0 && nc < cols && nr >= 0 && nr < rows) nb.push(id(nc, nr))
    }
    lists.push(nb)
  }
  const { nbrStart, nbrIdx } = toCSR(lists)
  return {
    cellCount: cols * rows, cols, rows, degree: 3, nbrStart, nbrIdx,
    fillCell(ctx, i, fillStyle) {
      const c = i % cols, r = (i / cols) | 0
      ctx.fillStyle = fillStyle
      ctx.beginPath()
      if (up(c, r)) {
        ctx.moveTo(c * half, (r + 1) * h)
        ctx.lineTo((c + 2) * half, (r + 1) * h)
        ctx.lineTo((c + 1) * half, r * h)
      } else {
        ctx.moveTo(c * half, r * h)
        ctx.lineTo((c + 2) * half, r * h)
        ctx.lineTo((c + 1) * half, (r + 1) * h)
      }
      ctx.closePath()
      ctx.fill()
    },
  }
}

export function buildTessellation(field: FieldKind, cellSize: number, width: number, height: number): Tessellation {
  switch (field) {
    case 'square': return buildSquare(cellSize, width, height)
    case 'hexagon': return buildHexagon(cellSize, width, height)
    case 'triangle': return buildTriangle(cellSize, width, height)
    default: throw new Error(`unknown field: ${field}`)
  }
}
