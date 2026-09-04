import { STATUS_CATEGORIES, STATUS_META, attentionReasons, attentionSeverity, isStale } from '../domain/status'
import type { StatusCategory } from '../domain/status'
import type { FleetSnapshot, RobotState } from '../domain/types'

export type FleetSummary = {
  total: number
  byCategory: Record<StatusCategory, number>
  /** Robots the attention rules flag, which is wider than the attention statuses. */
  needsAttention: number
  stale: number
  reporting: number
  avgBattery: number
  minBattery: number
}

export function summarise(snapshot: FleetSnapshot): FleetSummary {
  const byCategory = {} as Record<StatusCategory, number>
  for (const category of STATUS_CATEGORIES) byCategory[category] = 0

  let needsAttention = 0
  let stale = 0
  let reporting = 0
  let batterySum = 0
  let minBattery = Number.POSITIVE_INFINITY

  for (const robot of snapshot.robots) {
    byCategory[STATUS_META[robot.status].category]++
    if (attentionReasons(robot, snapshot.t).length > 0) needsAttention++
    if (isStale(robot, snapshot.t)) stale++
    if (robot.lastReportT !== null) {
      reporting++
      batterySum += robot.battery
      minBattery = Math.min(minBattery, robot.battery)
    }
  }

  return {
    total: snapshot.robots.length,
    byCategory,
    needsAttention,
    stale,
    reporting,
    avgBattery: reporting > 0 ? batterySum / reporting : 0,
    minBattery: reporting > 0 ? minBattery : 0,
  }
}

/** Worst first, then steady robots by id, so the top of the list is the work queue. */
export function rankByAttention(robots: readonly RobotState[], clockT: number): RobotState[] {
  return robots
    .map((robot) => ({ robot, severity: attentionSeverity(robot, clockT) }))
    .sort((a, b) => {
      if (b.severity !== a.severity) return b.severity - a.severity
      return a.robot.id.localeCompare(b.robot.id, 'en', { numeric: true })
    })
    .map((entry) => entry.robot)
}

/** Free-text match on id, type or the status as an operator would say it. */
export function matchesQuery(robot: RobotState, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (needle === '') return true
  return (
    robot.id.toLowerCase().includes(needle) ||
    robot.type.toLowerCase().includes(needle) ||
    STATUS_META[robot.status].label.toLowerCase().includes(needle)
  )
}

export function filterRobots(
  robots: readonly RobotState[],
  query: string,
  categories: ReadonlySet<StatusCategory>,
): RobotState[] {
  return robots.filter(
    (robot) =>
      matchesQuery(robot, query) &&
      (categories.size === 0 || categories.has(STATUS_META[robot.status].category)),
  )
}
