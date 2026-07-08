import { describe, it, expect } from 'vitest'
import { buildTargetBuffer, TARGET_KINDS } from './targets'

describe('buildTargetBuffer', () => {
  it('produces a buffer of the requested size for every target kind', () => {
    for (const kind of TARGET_KINDS) {
      const buf = buildTargetBuffer(kind, 20, 15)
      expect(buf.width).toBe(20)
      expect(buf.height).toBe(15)
      expect(buf.data).toHaveLength(20 * 15 * 3)
    }
  })

  it('is deterministic — same kind + size always produces the same pixels', () => {
    const a = buildTargetBuffer('sunset', 40, 30)
    const b = buildTargetBuffer('sunset', 40, 30)
    expect(Array.from(a.data)).toEqual(Array.from(b.data))
  })

  it('is not a flat single color — every target has visible structure', () => {
    for (const kind of TARGET_KINDS) {
      const buf = buildTargetBuffer(kind, 40, 30)
      const first = [buf.data[0], buf.data[1], buf.data[2]]
      let differs = false
      for (let i = 3; i < buf.data.length; i += 3) {
        if (buf.data[i] !== first[0] || buf.data[i + 1] !== first[1] || buf.data[i + 2] !== first[2]) {
          differs = true
          break
        }
      }
      expect(differs).toBe(true)
    }
  })
})
