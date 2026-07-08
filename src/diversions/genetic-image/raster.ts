// A pure, canvas-free polygon rasterizer + pixel-diff scorer. The hill-climb
// loop needs to render+diff thousands of tiny candidate images per second and
// jsdom's mocked 2D context can't do that (getImageData always returns a zero
// buffer in tests — see src/test-setup.ts) — so fitness evaluation never
// touches CanvasRenderingContext2D at all. It works on a small RGB byte buffer
// instead, which is both fast and fully testable in Node. The pretty on-screen
// view is a SEPARATE renderer (geneticImage.ts `render`) using the real 2D
// canvas API for smooth, antialiased polygons — the two renderers draw the same
// genome, just at different fidelity/purpose.

export interface PixelBuffer {
  data: Uint8ClampedArray // RGB triplets, length = width*height*3
  width: number
  height: number
}

export function createBuffer(width: number, height: number): PixelBuffer {
  return { data: new Uint8ClampedArray(Math.max(1, width) * Math.max(1, height) * 3), width, height }
}

export function fillBuffer(buf: PixelBuffer, r: number, g: number, b: number): void {
  const { data } = buf
  for (let i = 0; i < data.length; i += 3) {
    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
  }
}

/** Alpha-blend a simple polygon (normalized 0..1 vertex pairs, `points` =
 *  [x0,y0,x1,y1,...]) onto `buf` with a scanline edge-crossing fill. Works for
 *  convex or simple non-convex polygons (fan-shaped genome polygons are always
 *  simple by construction — see genome.ts `randomPolygon`). */
export function rasterPolygon(
  buf: PixelBuffer,
  points: readonly number[],
  r: number,
  g: number,
  b: number,
  a: number,
): void {
  if (a <= 0) return
  const alpha = a > 1 ? 1 : a
  const { width: w, height: h, data } = buf
  const n = points.length / 2
  if (n < 3) return

  const xs = new Array<number>(n)
  const ys = new Array<number>(n)
  let minY = Infinity
  let maxY = -Infinity
  for (let i = 0; i < n; i++) {
    const x = points[i * 2] * w
    const y = points[i * 2 + 1] * h
    xs[i] = x
    ys[i] = y
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }

  const yStart = Math.max(0, Math.floor(minY))
  const yEnd = Math.min(h - 1, Math.ceil(maxY))
  const xints: number[] = []
  for (let y = yStart; y <= yEnd; y++) {
    const yc = y + 0.5
    xints.length = 0
    for (let i = 0; i < n; i++) {
      const x1 = xs[i]
      const y1 = ys[i]
      const j = (i + 1) % n
      const x2 = xs[j]
      const y2 = ys[j]
      if ((y1 <= yc && y2 > yc) || (y2 <= yc && y1 > yc)) {
        xints.push(x1 + ((yc - y1) / (y2 - y1)) * (x2 - x1))
      }
    }
    xints.sort((p, q) => p - q)
    for (let i = 0; i + 1 < xints.length; i += 2) {
      const xStart = Math.max(0, Math.round(xints[i]))
      const xEnd = Math.min(w - 1, Math.round(xints[i + 1]) - 1)
      for (let x = xStart; x <= xEnd; x++) {
        const idx = (y * w + x) * 3
        data[idx] = data[idx] * (1 - alpha) + r * alpha
        data[idx + 1] = data[idx + 1] * (1 - alpha) + g * alpha
        data[idx + 2] = data[idx + 2] * (1 - alpha) + b * alpha
      }
    }
  }
}

/** Sum-of-squared-differences over every RGB byte between two same-sized
 *  buffers — the fitness score (lower is better). */
export function computeError(a: PixelBuffer, b: PixelBuffer): number {
  let sum = 0
  const da = a.data
  const db = b.data
  const n = Math.min(da.length, db.length)
  for (let i = 0; i < n; i++) {
    const d = da[i] - db[i]
    sum += d * d
  }
  return sum
}
