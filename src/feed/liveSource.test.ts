import { describe, expect, it } from 'vitest'
import { pointInRect, inflate } from '../domain/geometry'
import { OBSTACLES, OBSTACLE_CLEARANCE, SITE } from '../domain/site'
import { ROBOT_STATUSES, type Robot, type RobotEvent, type RobotState } from '../domain/types'
import { DEFAULT_REPORT_INTERVAL, LiveSource } from './liveSource'

const roster: Robot[] = [
  { id: 'r1', type: 'picker', start: { x: 569.9, y: 33 } },
  { id: 'r2', type: 'hauler', start: { x: 787.3, y: 65.2 } },
  { id: 'r3', type: 'picker', start: { x: 42.8, y: 123.4 } },
]

function run(source: LiveSource, until: number, chunk = until): RobotEvent[] {
  const events: RobotEvent[] = []
  for (let t = chunk; t <= until; t += chunk) events.push(...source.advanceTo(t))
  return events
}

describe('LiveSource', () => {
  it('produces the same feed for the same seed, however it is stepped', () => {
    const wholeRun = run(new LiveSource({ roster, seed: 7 }), 600)
    const chunked = run(new LiveSource({ roster, seed: 7 }), 600, 3)
    const otherSeed = run(new LiveSource({ roster, seed: 8 }), 600)

    expect(chunked).toEqual(wholeRun)
    expect(otherSeed).not.toEqual(wholeRun)
  })

  it('reports on the interval it was given', () => {
    const events = run(new LiveSource({ roster, seed: 3, reportInterval: 5 }), 50)

    for (const event of events) {
      expect(event.t % 5).toBe(0)
    }
    expect(events[0].t).toBe(5)
  })

  it('keeps robots on the floor, off the furniture and inside the battery range', () => {
    const events = run(new LiveSource({ roster, seed: 11 }), 3600)
    const blocked = OBSTACLES.map((rect) => inflate(rect, OBSTACLE_CLEARANCE))

    expect(events.length).toBeGreaterThan(1000)
    for (const event of events) {
      expect(event.x).toBeGreaterThanOrEqual(SITE.margin)
      expect(event.x).toBeLessThanOrEqual(SITE.width - SITE.margin)
      expect(event.y).toBeGreaterThanOrEqual(SITE.margin)
      expect(event.y).toBeLessThanOrEqual(SITE.height - SITE.margin)
      expect(event.battery).toBeGreaterThanOrEqual(0)
      expect(event.battery).toBeLessThanOrEqual(100)
      expect(ROBOT_STATUSES).toContain(event.status)
      expect(blocked.some((rect) => pointInRect(event.x, event.y, rect))).toBe(false)
    }
  })

  it('only goes quiet after saying it is going offline', () => {
    const events = run(new LiveSource({ roster, seed: 5 }), 3600)
    const byRobot = new Map<string, RobotEvent[]>()
    for (const event of events) {
      const list = byRobot.get(event.robotId) ?? []
      list.push(event)
      byRobot.set(event.robotId, list)
    }

    let gaps = 0
    for (const reports of byRobot.values()) {
      for (let i = 1; i < reports.length; i++) {
        if (reports[i].t - reports[i - 1].t > DEFAULT_REPORT_INTERVAL) {
          gaps++
          expect(reports[i - 1].status).toBe('offline')
        }
      }
    }
    expect(gaps).toBeGreaterThan(0)
  })

  it('drains a moving robot and refills one that is charging', () => {
    const events = run(new LiveSource({ roster, seed: 2 }), 1800)
    const moving = events.filter((event) => event.status === 'on_mission' || event.status === 'active')
    const charging = events.filter((event) => event.status === 'charging')

    expect(moving.length).toBeGreaterThan(0)
    expect(charging.length).toBeGreaterThan(0)
    // Nothing charges below the threshold that sends it to a charger.
    expect(Math.min(...charging.map((event) => event.battery))).toBeLessThanOrEqual(20)
  })

  it('carries on from the state the dashboard is already showing', () => {
    const current: RobotState[] = [
      {
        id: 'r1',
        type: 'picker',
        x: 400,
        y: 500,
        status: 'charging',
        battery: 42,
        lastReportT: 900,
        trackedSince: 0,
        statusSince: 880,
        distance: 0,
        reports: 10,
        lastTask: null,
        history: [],
      },
    ]

    const events = run(new LiveSource({ roster, seed: 4, startT: 900, initial: current }), 903)
    const first = events.find((event) => event.robotId === 'r1')

    expect(first?.t).toBe(901)
    expect(first?.x).toBeCloseTo(400)
    expect(first?.y).toBeCloseTo(500)
    expect(first?.battery).toBeCloseTo(42.41, 1)
  })
})
