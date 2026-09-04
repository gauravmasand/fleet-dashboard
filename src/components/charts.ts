/** Maps a value in [d0, d1] onto [r0, r1]. Degenerate domains collapse to r0. */
export function linearScale(d0: number, d1: number, r0: number, r1: number): (value: number) => number {
  if (d1 === d0) return () => r0
  const factor = (r1 - r0) / (d1 - d0)
  return (value) => r0 + (value - d0) * factor
}

export function linePath(xs: readonly number[], ys: readonly number[]): string {
  if (xs.length === 0) return ''
  let path = `M ${xs[0].toFixed(2)} ${ys[0].toFixed(2)}`
  for (let i = 1; i < xs.length; i++) {
    path += ` L ${xs[i].toFixed(2)} ${ys[i].toFixed(2)}`
  }
  return path
}

/**
 * One closed path per series, stacked bottom to top and normalised so each column
 * fills the height. Stepped rather than sloped: a robot holds a status until it
 * reports a new one, and drawing a ramp between samples would imply otherwise.
 *
 * columns[pointIndex][seriesIndex]; xs is the pixel position of each point.
 */
export function stackedAreaPaths(
  columns: ReadonlyArray<ReadonlyArray<number>>,
  xs: readonly number[],
  height: number,
): string[] {
  const seriesCount = columns[0]?.length ?? 0
  if (columns.length === 0 || seriesCount === 0) return []

  // Cumulative fraction at the top of each band, per column.
  const tops: number[][] = columns.map((column) => {
    const total = column.reduce((sum, value) => sum + value, 0)
    const edges: number[] = []
    let running = 0
    for (const value of column) {
      running += total > 0 ? value / total : 0
      edges.push(running)
    }
    return edges
  })

  const paths: string[] = []
  for (let series = 0; series < seriesCount; series++) {
    const top = (index: number) => height * (1 - tops[index][series])
    const bottom = (index: number) =>
      height * (1 - (series === 0 ? 0 : tops[index][series - 1]))

    let path = `M ${xs[0].toFixed(2)} ${top(0).toFixed(2)}`
    for (let i = 1; i < xs.length; i++) {
      path += ` L ${xs[i].toFixed(2)} ${top(i - 1).toFixed(2)}`
      path += ` L ${xs[i].toFixed(2)} ${top(i).toFixed(2)}`
    }
    for (let i = xs.length - 1; i > 0; i--) {
      path += ` L ${xs[i].toFixed(2)} ${bottom(i).toFixed(2)}`
      path += ` L ${xs[i].toFixed(2)} ${bottom(i - 1).toFixed(2)}`
    }
    path += ` L ${xs[0].toFixed(2)} ${bottom(0).toFixed(2)} Z`
    paths.push(path)
  }

  return paths
}

/** Index of the sample nearest a pixel position, for the shared crosshair. */
export function nearestIndex(xs: readonly number[], pixelX: number): number {
  if (xs.length === 0) return -1
  let best = 0
  let bestDistance = Math.abs(xs[0] - pixelX)
  for (let i = 1; i < xs.length; i++) {
    const distance = Math.abs(xs[i] - pixelX)
    if (distance < bestDistance) {
      best = i
      bestDistance = distance
    }
  }
  return best
}
