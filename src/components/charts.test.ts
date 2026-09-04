import { describe, expect, it } from 'vitest'
import { linearScale, linePath, nearestIndex, stackedAreaPaths } from './charts'

describe('linearScale', () => {
  it('maps the domain onto the range', () => {
    const scale = linearScale(0, 900, 0, 450)
    expect(scale(0)).toBe(0)
    expect(scale(900)).toBe(450)
    expect(scale(450)).toBe(225)
  })

  it('survives a domain with no width', () => {
    expect(linearScale(5, 5, 10, 20)(5)).toBe(10)
  })
})

describe('linePath', () => {
  it('builds a path through the points', () => {
    expect(linePath([0, 10], [5, 15])).toBe('M 0.00 5.00 L 10.00 15.00')
  })

  it('returns nothing for no points', () => {
    expect(linePath([], [])).toBe('')
  })
})

describe('stackedAreaPaths', () => {
  it('returns one path per series', () => {
    const paths = stackedAreaPaths(
      [
        [1, 1],
        [2, 0],
      ],
      [0, 100],
      50,
    )
    expect(paths).toHaveLength(2)
  })

  it('fills the height when a single series holds everything', () => {
    const [only] = stackedAreaPaths([[4], [4]], [0, 100], 50)

    // Top edge sits at y=0 and the band closes along the baseline at y=50.
    expect(only).toContain('M 0.00 0.00')
    expect(only.endsWith('L 0.00 50.00 Z')).toBe(true)
  })

  it('treats an empty column as zero rather than dividing by it', () => {
    const paths = stackedAreaPaths(
      [
        [0, 0],
        [1, 1],
      ],
      [0, 100],
      50,
    )
    for (const path of paths) {
      expect(path).not.toContain('NaN')
    }
  })

  it('returns nothing when there is no data yet', () => {
    expect(stackedAreaPaths([], [], 50)).toEqual([])
  })
})

describe('nearestIndex', () => {
  it('finds the closest sample', () => {
    expect(nearestIndex([0, 10, 20], 9)).toBe(1)
    expect(nearestIndex([0, 10, 20], 100)).toBe(2)
    expect(nearestIndex([], 5)).toBe(-1)
  })
})
