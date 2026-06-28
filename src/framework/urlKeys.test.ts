import { describe, it, expect } from 'vitest'
import { listDiversions } from './registry'
import { leafNameCollisions, nonScalarArrayLeaves } from './urlCodec'

describe('URL key uniqueness (flat-naming guard)', () => {
  for (const d of listDiversions()) {
    it(`${d.id}: every schema leaf name is globally unique`, () => {
      // If this fails, two fields share a final path segment and would collide
      // in the flat URL. Rename one field, or add an explicit url-key escape hatch.
      expect(leafNameCollisions(d.schema as any)).toEqual([])
    })
  }
})

describe('URL codec scalar-array guard (#123)', () => {
  for (const d of listDiversions()) {
    it(`${d.id}: every array leaf has scalar elements`, () => {
      // If this fails, a field is an array of objects/arrays, which the flat URL
      // codec can't round-trip — encode/decode throw. Flatten the shape or split
      // into scalar fields.
      expect(nonScalarArrayLeaves(d.schema as any)).toEqual([])
    })
  }
})
