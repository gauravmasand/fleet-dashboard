import { clamp, inflate, pointInRect, segmentIntersectsRect } from '../domain/geometry'
import { OBSTACLES, OBSTACLE_CLEARANCE, SITE, type Rect } from '../domain/site'
import type { Robot, RobotEvent, RobotState, RobotStatus } from '../domain/types'
import { createRandom, pickWeighted, randomBetween } from './random'
import type { EventSource } from './source'

/** Simulation seconds between two reports from the same robot. */
export const DEFAULT_REPORT_INTERVAL = 1

/**
 * Battery change per second, read off the recorded log: robots on the move lose
 * about 0.1%/s, charging gains about 0.41%/s, everything else trickles.
 */
const BATTERY_RATE: Record<RobotStatus, number> = {
  active: -0.1,
  on_mission: -0.106,
  blocked: -0.02,
  idle: -0.015,
  error: -0.01,
  maintenance: -0.01,
  offline: -0.01,
  charging: 0.41,
}

/** Units per second, also from the log: about 1.8 for active, 2.1 on a mission. */
const SPEED: Partial<Record<RobotStatus, number>> = {
  active: 1.85,
  on_mission: 2.1,
}

/**
 * Roughly the transition mix the recorded window shows: idle is the hub, errors
 * and maintenance clear back to idle, blocked usually resolves into work again.
 */
const TRANSITIONS: Record<RobotStatus, ReadonlyArray<readonly [RobotStatus, number]>> = {
  idle: [
    ['active', 30],
    ['on_mission', 25],
    ['idle', 14],
    ['blocked', 8],
    ['error', 8],
    ['maintenance', 6],
    ['charging', 5],
    ['offline', 4],
  ],
  active: [
    ['on_mission', 25],
    ['active', 25],
    ['idle', 20],
    ['blocked', 12],
    ['error', 8],
    ['maintenance', 6],
    ['offline', 4],
  ],
  on_mission: [
    ['on_mission', 30],
    ['active', 20],
    ['idle', 20],
    ['blocked', 12],
    ['error', 8],
    ['maintenance', 6],
    ['offline', 4],
  ],
  blocked: [
    ['active', 35],
    ['on_mission', 25],
    ['idle', 15],
    ['blocked', 10],
    ['error', 10],
    ['maintenance', 5],
  ],
  error: [
    ['idle', 60],
    ['error', 25],
    ['maintenance', 15],
  ],
  maintenance: [
    ['idle', 70],
    ['maintenance', 30],
  ],
  // Both of these leave through a rule rather than a roll: charging runs until the
  // pack is full, offline until the outage timer expires.
  charging: [['charging', 1]],
  offline: [['offline', 1]],
}

const CHARGE_BELOW = 15
const CHARGE_UNTIL = 85
const DECISION_INTERVAL = { min: 8, max: 30 }
const OUTAGE_SECONDS = { min: 20, max: 60 }
const MAX_WAYPOINT_ATTEMPTS = 24

type SimRobot = {
  id: string
  x: number
  y: number
  status: RobotStatus
  battery: number
  target: { x: number; y: number } | null
  nextDecisionT: number
  backOnlineT: number
}

export type LiveSourceOptions = {
  roster: readonly Robot[]
  seed?: number
  startT?: number
  reportInterval?: number
  /** Continue from what the dashboard is already showing instead of the roster. */
  initial?: readonly RobotState[]
}

const BLOCKED_RECTS: Rect[] = OBSTACLES.map((rect) => inflate(rect, OBSTACLE_CLEARANCE))

function insideAnything(x: number, y: number): boolean {
  return BLOCKED_RECTS.some((rect) => pointInRect(x, y, rect))
}

/** Nudges a point off the furniture, used when seeding from a recorded position. */
function escapeObstacles(x: number, y: number): { x: number; y: number } {
  let px = x
  let py = y

  for (let pass = 0; pass < BLOCKED_RECTS.length; pass++) {
    const rect = BLOCKED_RECTS.find((candidate) => pointInRect(px, py, candidate))
    if (!rect) break

    const left = px - rect.x
    const right = rect.x + rect.w - px
    const up = py - rect.y
    const down = rect.y + rect.h - py
    const shortest = Math.min(left, right, up, down)

    if (shortest === left) px = rect.x - 1
    else if (shortest === right) px = rect.x + rect.w + 1
    else if (shortest === up) py = rect.y - 1
    else py = rect.y + rect.h + 1
  }

  return {
    x: clamp(px, SITE.margin, SITE.width - SITE.margin),
    y: clamp(py, SITE.margin, SITE.height - SITE.margin),
  }
}

/**
 * Generates fresh telemetry for the same fleet, so the dashboard has something to
 * watch once the recorded window runs out. Movement, battery and status all follow
 * the rates observed in the recording, and every robot walks a straight line to a
 * waypoint it can actually reach.
 */
export class LiveSource implements EventSource {
  readonly kind = 'live'
  readonly endT = null
  private random: () => number
  private robots: SimRobot[]
  private interval: number
  private startT: number
  private step = 0
  private options: LiveSourceOptions

  constructor(options: LiveSourceOptions) {
    this.options = options
    this.interval = options.reportInterval ?? DEFAULT_REPORT_INTERVAL
    this.startT = options.startT ?? 0
    this.random = createRandom(options.seed ?? 1)
    this.robots = this.seedRobots()
  }

  private seedRobots(): SimRobot[] {
    const { roster, initial } = this.options
    const byId = new Map((initial ?? []).map((robot) => [robot.id, robot]))

    return roster.map((robot) => {
      const known = byId.get(robot.id)
      const position = escapeObstacles(
        known?.x ?? robot.start.x,
        known?.y ?? robot.start.y,
      )
      const status = known?.status ?? 'idle'
      return {
        id: robot.id,
        x: position.x,
        y: position.y,
        status,
        battery:
          known && known.lastReportT !== null
            ? known.battery
            : Math.round(randomBetween(this.random, 45, 95) * 10) / 10,
        target: null,
        nextDecisionT: this.startT + randomBetween(this.random, 1, DECISION_INTERVAL.max),
        backOnlineT:
          status === 'offline'
            ? this.startT + randomBetween(this.random, OUTAGE_SECONDS.min, OUTAGE_SECONDS.max)
            : 0,
      }
    })
  }

  advanceTo(simT: number): RobotEvent[] {
    const batch: RobotEvent[] = []

    while (this.startT + (this.step + 1) * this.interval <= simT) {
      this.step++
      const t = this.startT + this.step * this.interval
      for (const robot of this.robots) {
        const event = this.stepRobot(robot, t)
        if (event) batch.push(event)
      }
    }

    return batch
  }

  reset() {
    this.random = createRandom(this.options.seed ?? 1)
    this.robots = this.seedRobots()
    this.step = 0
  }

  private stepRobot(robot: SimRobot, t: number): RobotEvent | null {
    const wasOffline = robot.status === 'offline'
    const taskEvent = this.updateStatus(robot, t)
    this.move(robot)
    robot.battery = clamp(robot.battery + BATTERY_RATE[robot.status] * this.interval, 0, 100)

    // A robot that has dropped off the network cannot tell us anything. It gets one
    // last report as it goes down, then goes quiet until the outage clears, which is
    // what makes the "no telemetry" path in the dashboard real rather than decorative.
    if (robot.status === 'offline' && wasOffline) return null

    return {
      t,
      robotId: robot.id,
      x: Math.round(robot.x * 10) / 10,
      y: Math.round(robot.y * 10) / 10,
      status: robot.status,
      battery: Math.round(robot.battery * 10) / 10,
      ...(taskEvent ? { taskEvent } : {}),
    }
  }

  private updateStatus(robot: SimRobot, t: number): RobotEvent['taskEvent'] {
    const previous = robot.status

    if (robot.status === 'offline') {
      if (t < robot.backOnlineT) return undefined
      robot.status = 'idle'
    } else if (robot.status === 'charging') {
      if (robot.battery < CHARGE_UNTIL) return undefined
      robot.status = 'idle'
    } else if (robot.battery <= CHARGE_BELOW) {
      robot.status = 'charging'
    } else if (t >= robot.nextDecisionT) {
      robot.status = pickWeighted(this.random, TRANSITIONS[robot.status])
    } else {
      return undefined
    }

    robot.nextDecisionT = t + randomBetween(this.random, DECISION_INTERVAL.min, DECISION_INTERVAL.max)
    if (robot.status === 'offline') {
      robot.backOnlineT = t + randomBetween(this.random, OUTAGE_SECONDS.min, OUTAGE_SECONDS.max)
    }
    if (robot.status !== 'active' && robot.status !== 'on_mission') {
      robot.target = null
    }

    if (robot.status === 'on_mission' && previous !== 'on_mission') return 'task_started'
    if (previous === 'on_mission' && robot.status !== 'on_mission' && robot.status !== 'error') {
      return 'task_completed'
    }
    return undefined
  }

  private move(robot: SimRobot) {
    const speed = SPEED[robot.status]
    if (speed === undefined) return

    if (!robot.target) robot.target = this.pickWaypoint(robot)
    if (!robot.target) return

    const dx = robot.target.x - robot.x
    const dy = robot.target.y - robot.y
    const distance = Math.hypot(dx, dy)
    const stride = speed * this.interval * randomBetween(this.random, 0.85, 1.15)

    if (distance <= stride) {
      robot.x = robot.target.x
      robot.y = robot.target.y
      robot.target = null
      return
    }

    robot.x = clamp(robot.x + (dx / distance) * stride, SITE.margin, SITE.width - SITE.margin)
    robot.y = clamp(robot.y + (dy / distance) * stride, SITE.margin, SITE.height - SITE.margin)
  }

  /**
   * Rejection sampling: keep drawing points until one is off the furniture and can
   * be reached in a straight line. Cheaper and easier to reason about than path
   * planning, and the floor is open enough that it lands within a few tries.
   */
  private pickWaypoint(robot: SimRobot): { x: number; y: number } | null {
    for (let attempt = 0; attempt < MAX_WAYPOINT_ATTEMPTS; attempt++) {
      const x = randomBetween(this.random, SITE.margin, SITE.width - SITE.margin)
      const y = randomBetween(this.random, SITE.margin, SITE.height - SITE.margin)
      if (insideAnything(x, y)) continue
      if (BLOCKED_RECTS.some((rect) => segmentIntersectsRect(robot.x, robot.y, x, y, rect))) continue
      return { x, y }
    }
    return null
  }
}
