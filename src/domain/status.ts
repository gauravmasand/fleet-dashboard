import type { RobotState, RobotStatus } from './types'

/**
 * The spec deliberately leaves "working" and "needs attention" undefined, so this
 * file is where that call is made and the only place to change it.
 *
 * active vs on_mission: in the recorded log both move at roughly 2 units/s and
 * drain about 0.1%/s, so they are the same thing operationally. We read
 * on_mission as "executing an assigned task" and active as "powered and moving
 * without one", and count both as working.
 */
export const STATUS_CATEGORIES = ['working', 'idle', 'charging', 'maintenance', 'attention'] as const
export type StatusCategory = (typeof STATUS_CATEGORIES)[number]

export const CATEGORY_META: Record<StatusCategory, { label: string; color: string }> = {
  working: { label: 'Working', color: '#199e70' },
  idle: { label: 'Idle', color: '#3987e5' },
  charging: { label: 'Charging', color: '#c98500' },
  // Deliberately colourless: planned downtime, not an alarm. Maintenance markers
  // also render hollow so the state does not rest on hue alone.
  maintenance: { label: 'Maintenance', color: '#b0aea6' },
  attention: { label: 'Needs attention', color: '#d03b3b' },
}

export const STATUS_META: Record<RobotStatus, { label: string; category: StatusCategory }> = {
  active: { label: 'Active', category: 'working' },
  on_mission: { label: 'On mission', category: 'working' },
  idle: { label: 'Idle', category: 'idle' },
  charging: { label: 'Charging', category: 'charging' },
  maintenance: { label: 'Maintenance', category: 'maintenance' },
  blocked: { label: 'Blocked', category: 'attention' },
  error: { label: 'Error', category: 'attention' },
  offline: { label: 'Offline', category: 'attention' },
}

export const THRESHOLDS = {
  lowBatteryPct: 20,
  criticalBatteryPct: 10,
  /** Four missed reports at the recorded 5s cadence. */
  staleAfterSeconds: 20,
}

export type AttentionReason = {
  code: 'error' | 'offline' | 'stale' | 'critical_battery' | 'blocked' | 'low_battery'
  label: string
  /** Higher sorts first. */
  severity: number
}

export function statusColor(status: RobotStatus): string {
  return CATEGORY_META[STATUS_META[status].category].color
}

export function isStale(robot: RobotState, clockT: number): boolean {
  const since = robot.lastReportT ?? robot.trackedSince
  return clockT - since > THRESHOLDS.staleAfterSeconds
}

export function secondsSilent(robot: RobotState, clockT: number): number {
  return clockT - (robot.lastReportT ?? robot.trackedSince)
}

/**
 * Everything an operator would want pulled out of the queue, most urgent first.
 * Low battery and silence are not statuses the robot reports, so they are worked
 * out here rather than read off the last event.
 */
export function attentionReasons(robot: RobotState, clockT: number): AttentionReason[] {
  const reasons: AttentionReason[] = []

  if (robot.status === 'error') {
    reasons.push({ code: 'error', label: 'Reporting an error', severity: 100 })
  }
  if (robot.status === 'offline') {
    reasons.push({ code: 'offline', label: 'Offline', severity: 90 })
  }
  if (isStale(robot, clockT)) {
    const silence = Math.round(secondsSilent(robot, clockT))
    const label = robot.lastReportT === null ? 'No telemetry yet' : `No telemetry for ${silence}s`
    reasons.push({ code: 'stale', label, severity: 85 })
  }
  // Battery rules only apply once the robot has actually told us something.
  if (
    robot.lastReportT !== null &&
    robot.battery <= THRESHOLDS.criticalBatteryPct &&
    robot.status !== 'charging'
  ) {
    reasons.push({
      code: 'critical_battery',
      label: `Battery critical (${robot.battery.toFixed(0)}%)`,
      severity: 80,
    })
  }
  if (robot.status === 'blocked') {
    reasons.push({ code: 'blocked', label: 'Blocked on its route', severity: 60 })
  }
  if (
    robot.lastReportT !== null &&
    robot.battery <= THRESHOLDS.lowBatteryPct &&
    robot.battery > THRESHOLDS.criticalBatteryPct &&
    robot.status !== 'charging'
  ) {
    reasons.push({
      code: 'low_battery',
      label: `Battery low (${robot.battery.toFixed(0)}%)`,
      severity: 40,
    })
  }

  return reasons.sort((a, b) => b.severity - a.severity)
}

export function attentionSeverity(robot: RobotState, clockT: number): number {
  const reasons = attentionReasons(robot, clockT)
  return reasons.length === 0 ? 0 : reasons[0].severity
}
