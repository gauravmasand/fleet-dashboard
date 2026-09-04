import { isStale } from '../domain/status'
import {
  ROBOT_STATUSES,
  type FleetSnapshot,
  type Robot,
  type RobotEvent,
  type RobotState,
  type RobotStatus,
  type TrendSample,
} from '../domain/types'

/** How often the fleet is sampled for the trend charts, in simulation seconds. */
export const TREND_BUCKET_SECONDS = 15
/** Two hours of trend at the bucket size above; the live feed can run all day. */
export const TREND_CAPACITY = 480
/** Per robot, backs the map trail and the battery sparkline. */
export const HISTORY_CAPACITY = 90

function zeroCounts(): Record<RobotStatus, number> {
  const counts = {} as Record<RobotStatus, number>
  for (const status of ROBOT_STATUSES) counts[status] = 0
  return counts
}

/**
 * Holds the fleet's current state and a bounded history of it.
 *
 * The replay and the live feed both push RobotEvents in here and nothing else
 * downstream knows which one it is watching. Kept outside React so a burst of
 * reports costs one render instead of one render per report.
 */
export class FleetStore {
  private roster: readonly Robot[]
  private records = new Map<string, RobotState>()
  private trend: TrendSample[] = []
  private nextTrendAt = 0
  private startT = 0
  private clockT = 0
  private reportsApplied = 0
  private lateReportsDropped = 0
  private unknownRobotReports = 0
  private listeners = new Set<() => void>()
  private snapshot: FleetSnapshot
  private snapshotStale = true
  private lastNotifiedT = 0

  constructor(roster: readonly Robot[]) {
    this.roster = roster
    this.reset(0)
    this.snapshot = this.buildSnapshot()
    this.snapshotStale = false
  }

  /** Rewinds to the roster's starting positions with nothing yet reported. */
  reset(startT = 0) {
    this.records = new Map(
      this.roster.map((robot) => [
        robot.id,
        {
          id: robot.id,
          type: robot.type,
          x: robot.start.x,
          y: robot.start.y,
          status: 'idle' as RobotStatus,
          battery: 0,
          lastReportT: null,
          trackedSince: startT,
          statusSince: startT,
          distance: 0,
          reports: 0,
          lastTask: null,
          history: [],
        },
      ]),
    )
    this.trend = []
    this.nextTrendAt = startT
    this.startT = startT
    this.clockT = startT
    this.lastNotifiedT = startT
    this.reportsApplied = 0
    this.lateReportsDropped = 0
    this.unknownRobotReports = 0
    this.snapshotStale = true
    this.notify()
  }

  /**
   * Applies a batch of reports and moves the clock to `clockT`. Events must be in
   * ascending t; both sources emit them that way.
   */
  applyEvents(events: readonly RobotEvent[], clockT: number) {
    let changed = false

    for (const event of events) {
      const record = this.records.get(event.robotId)
      if (!record) {
        this.unknownRobotReports++
        changed = true
        continue
      }
      // Last writer wins by report time, so a straggler from a slow link cannot
      // drag a robot back to where it used to be.
      if (record.lastReportT !== null && event.t < record.lastReportT) {
        this.lateReportsDropped++
        changed = true
        continue
      }

      this.rollTrendTo(event.t)
      this.applyToRecord(record, event)
      this.reportsApplied++
      changed = true
    }

    if (clockT > this.clockT) this.clockT = clockT
    this.rollTrendTo(this.clockT)

    // A silent fleet still ages: staleness and "blocked for 40s" have to tick on.
    if (changed || this.clockT - this.lastNotifiedT >= 1) {
      this.snapshotStale = true
      this.lastNotifiedT = this.clockT
      this.notify()
    }
  }

  private applyToRecord(record: RobotState, event: RobotEvent) {
    if (record.lastReportT !== null) {
      record.distance += Math.hypot(event.x - record.x, event.y - record.y)
    }
    if (event.status !== record.status || record.lastReportT === null) {
      record.status = event.status
      record.statusSince = event.t
    }

    record.x = event.x
    record.y = event.y
    record.battery = event.battery
    record.lastReportT = event.t
    record.reports++
    if (event.taskEvent) record.lastTask = { t: event.t, kind: event.taskEvent }

    record.history.push({
      t: event.t,
      x: event.x,
      y: event.y,
      battery: event.battery,
      status: event.status,
    })
    if (record.history.length > HISTORY_CAPACITY) record.history.shift()
  }

  /**
   * Trend points are samples of fleet state on a fixed grid, not counts of the
   * events that arrived. That keeps "how much of the fleet was working" honest
   * when a robot reports twice as often as its neighbour, or stops reporting.
   */
  private rollTrendTo(time: number) {
    while (this.nextTrendAt <= time) {
      this.trend.push(this.sampleFleet(this.nextTrendAt))
      if (this.trend.length > TREND_CAPACITY) this.trend.shift()
      this.nextTrendAt += TREND_BUCKET_SECONDS
    }
  }

  private sampleFleet(t: number): TrendSample {
    const byStatus = zeroCounts()
    let batterySum = 0
    let minBattery = Number.POSITIVE_INFINITY
    let reporting = 0
    let stale = 0

    for (const record of this.records.values()) {
      byStatus[record.status]++
      if (isStale(record, t)) stale++
      if (record.lastReportT !== null) {
        batterySum += record.battery
        minBattery = Math.min(minBattery, record.battery)
        reporting++
      }
    }

    return {
      t,
      byStatus,
      stale,
      reporting,
      avgBattery: reporting > 0 ? batterySum / reporting : 0,
      minBattery: reporting > 0 ? minBattery : 0,
    }
  }

  getSnapshot = (): FleetSnapshot => {
    if (this.snapshotStale) {
      this.snapshot = this.buildSnapshot()
      this.snapshotStale = false
    }
    return this.snapshot
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private buildSnapshot(): FleetSnapshot {
    const byStatus = zeroCounts()
    const robots: RobotState[] = []

    for (const record of this.records.values()) {
      byStatus[record.status]++
      robots.push({ ...record, history: record.history.slice() })
    }
    robots.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }))

    return {
      t: this.clockT,
      robots,
      byStatus,
      trend: this.trend.slice(),
      reportsApplied: this.reportsApplied,
      lateReportsDropped: this.lateReportsDropped,
      unknownRobotReports: this.unknownRobotReports,
    }
  }

  private notify() {
    for (const listener of this.listeners) listener()
  }

  get windowStart(): number {
    return this.startT
  }
}
