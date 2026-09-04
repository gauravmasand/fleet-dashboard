export const ROBOT_STATUSES = [
  'idle',
  'active',
  'on_mission',
  'charging',
  'blocked',
  'error',
  'maintenance',
  'offline',
] as const

export type RobotStatus = (typeof ROBOT_STATUSES)[number]

export type TaskEventKind = 'task_started' | 'task_completed'

/** One telemetry report from one robot, already normalised from the wire format. */
export type RobotEvent = {
  /** Seconds since the start of the observed window. */
  t: number
  robotId: string
  x: number
  y: number
  status: RobotStatus
  battery: number
  taskEvent?: TaskEventKind
}

/** A robot as listed in robots.json. */
export type Robot = {
  id: string
  type: string
  start: { x: number; y: number }
}

export type HistoryPoint = {
  t: number
  x: number
  y: number
  battery: number
  status: RobotStatus
}

/** What the dashboard knows about a robot right now. */
export type RobotState = {
  id: string
  type: string
  x: number
  y: number
  status: RobotStatus
  battery: number
  /** Timestamp of the most recent accepted report, or null if it has never reported. */
  lastReportT: number | null
  /** When the dashboard started watching this robot, so silence has an origin. */
  trackedSince: number
  /** When the current status began, so the UI can show "blocked for 2m". */
  statusSince: number
  /** Total distance covered across all reports, in site units. */
  distance: number
  reports: number
  lastTask: { t: number; kind: TaskEventKind } | null
  history: HistoryPoint[]
}

/**
 * Fleet composition at one point in time. Stored per status rather than per
 * category so the status taxonomy can change without invalidating history.
 */
export type TrendSample = {
  t: number
  byStatus: Record<RobotStatus, number>
  /** Robots whose telemetry had gone stale at this point. */
  stale: number
  /** Robots that had reported at least once, so an empty average is not drawn as zero. */
  reporting: number
  avgBattery: number
  minBattery: number
}

/** Immutable view of the fleet handed to React on every flush. */
export type FleetSnapshot = {
  /** Current simulation time, which can run ahead of the newest report. */
  t: number
  robots: RobotState[]
  byStatus: Record<RobotStatus, number>
  trend: TrendSample[]
  reportsApplied: number
  /** Reports discarded because a newer one had already arrived. */
  lateReportsDropped: number
  /** Reports discarded because the robot is not in the roster. */
  unknownRobotReports: number
}
