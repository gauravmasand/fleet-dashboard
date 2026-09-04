/**
 * mulberry32. The live feed needs to be reproducible so it can be unit tested and
 * so a demo can be repeated; Math.random would give neither.
 */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function randomBetween(random: () => number, min: number, max: number): number {
  return min + random() * (max - min)
}

export function pickWeighted<T>(random: () => number, entries: ReadonlyArray<readonly [T, number]>): T {
  let total = 0
  for (const [, weight] of entries) total += weight

  let roll = random() * total
  for (const [value, weight] of entries) {
    roll -= weight
    if (roll <= 0) return value
  }
  return entries[entries.length - 1][0]
}
