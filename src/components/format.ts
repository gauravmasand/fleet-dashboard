/** mm:ss, the way an operator reads a window that is minutes long. */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(whole / 60)
  return `${minutes}:${String(whole % 60).padStart(2, '0')}`
}

export function formatDuration(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds))
  if (whole < 60) return `${whole}s`
  const minutes = Math.floor(whole / 60)
  const rest = whole % 60
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`
}

export function formatPercent(value: number): string {
  return `${value.toFixed(0)}%`
}

export function formatPosition(x: number, y: number): string {
  return `${x.toFixed(0)}, ${y.toFixed(0)}`
}
