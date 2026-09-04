import type { Rect } from './site'

export function pointInRect(x: number, y: number, r: Rect): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
}

export function inflate(r: Rect, by: number): Rect {
  return { x: r.x - by, y: r.y - by, w: r.w + by * 2, h: r.h + by * 2 }
}

export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

/**
 * Liang-Barsky: clip the segment against the rectangle's slabs and see whether
 * anything survives. Used to reject waypoints a robot cannot walk to in a
 * straight line.
 */
export function segmentIntersectsRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: Rect,
): boolean {
  if (pointInRect(x0, y0, r) || pointInRect(x1, y1, r)) return true

  const dx = x1 - x0
  const dy = y1 - y0
  let tMin = 0
  let tMax = 1

  const edges: Array<[number, number]> = [
    [-dx, x0 - r.x],
    [dx, r.x + r.w - x0],
    [-dy, y0 - r.y],
    [dy, r.y + r.h - y0],
  ]

  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false
      continue
    }
    const t = q / p
    if (p < 0) {
      if (t > tMax) return false
      if (t > tMin) tMin = t
    } else {
      if (t < tMin) return false
      if (t < tMax) tMax = t
    }
  }

  return tMin <= tMax
}
