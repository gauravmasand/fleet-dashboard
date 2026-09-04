import { describe, expect, it } from 'vitest'
import { clamp, inflate, pointInRect, segmentIntersectsRect } from './geometry'
import type { Rect } from './site'

const rect: Rect = { x: 100, y: 100, w: 100, h: 50 }

describe('geometry', () => {
  it('treats the rectangle edge as inside', () => {
    expect(pointInRect(100, 100, rect)).toBe(true)
    expect(pointInRect(200, 150, rect)).toBe(true)
    expect(pointInRect(99.9, 125, rect)).toBe(false)
  })

  it('grows a rectangle in every direction', () => {
    expect(inflate(rect, 5)).toEqual({ x: 95, y: 95, w: 110, h: 60 })
  })

  it('clamps to the range', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(11, 0, 10)).toBe(10)
  })

  describe('segmentIntersectsRect', () => {
    it('finds a segment that cuts straight through', () => {
      expect(segmentIntersectsRect(50, 125, 250, 125, rect)).toBe(true)
    })

    it('finds a segment that only clips a corner', () => {
      expect(segmentIntersectsRect(80, 120, 120, 80, rect)).toBe(true)
    })

    it('rejects a segment that passes above the rectangle', () => {
      expect(segmentIntersectsRect(50, 50, 250, 50, rect)).toBe(false)
    })

    it('rejects a segment that stops short of it', () => {
      expect(segmentIntersectsRect(0, 125, 90, 125, rect)).toBe(false)
    })

    it('counts a segment that starts or ends inside', () => {
      expect(segmentIntersectsRect(150, 125, 400, 400, rect)).toBe(true)
      expect(segmentIntersectsRect(400, 400, 150, 125, rect)).toBe(true)
    })

    it('handles a zero length segment', () => {
      expect(segmentIntersectsRect(150, 125, 150, 125, rect)).toBe(true)
      expect(segmentIntersectsRect(10, 10, 10, 10, rect)).toBe(false)
    })
  })
})
