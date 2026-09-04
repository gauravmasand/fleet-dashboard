import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseEventLog, parseRoster } from '../data/parseEvents'
import { THRESHOLDS, isStale } from '../domain/status'
import type { Robot, RobotEvent, RobotStatus } from '../domain/types'
import { ReplaySource } from '../feed/replaySource'
import { HISTORY_CAPACITY, FleetStore, TREND_BUCKET_SECONDS, TREND_CAPACITY } from './fleetStore'

const roster: Robot[] = [
  { id: 'r1', type: 'picker', start: { x: 10, y: 10 } },
  { id: 'r2', type: 'hauler', start: { x: 20, y: 20 } },
]

function report(overrides: Partial<RobotEvent> & { t: number; robotId: string }): RobotEvent {
  return {
    x: 0,
    y: 0,
    status: 'idle' as RobotStatus,
    battery: 50,
    ...overrides,
  }
}

describe('FleetStore', () => {
  it('starts every robot at its roster position with nothing reported', () => {
    const snapshot = new FleetStore(roster).getSnapshot()

    expect(snapshot.robots.map((robot) => robot.id)).toEqual(['r1', 'r2'])
    expect(snapshot.robots[0]).toMatchObject({ x: 10, y: 10, lastReportT: null, reports: 0 })
  })

  it('keeps the newest report and remembers when the status changed', () => {
    const store = new FleetStore(roster)

    store.applyEvents([report({ t: 0, robotId: 'r1', x: 10, y: 10, status: 'idle' })], 0)
    store.applyEvents([report({ t: 5, robotId: 'r1', x: 13, y: 14, status: 'active', battery: 49 })], 5)
    const robot = store.getSnapshot().robots[0]

    expect(robot).toMatchObject({ x: 13, y: 14, status: 'active', battery: 49, statusSince: 5 })
    expect(robot.distance).toBeCloseTo(5)
    expect(robot.reports).toBe(2)
  })

  it('drops a report that arrives after a newer one', () => {
    const store = new FleetStore(roster)

    store.applyEvents([report({ t: 10, robotId: 'r1', x: 5, y: 5 })], 10)
    store.applyEvents([report({ t: 4, robotId: 'r1', x: 99, y: 99 })], 10)
    const snapshot = store.getSnapshot()

    expect(snapshot.robots[0]).toMatchObject({ x: 5, y: 5 })
    expect(snapshot.lateReportsDropped).toBe(1)
    expect(snapshot.reportsApplied).toBe(1)
  })

  it('ignores reports from a robot that is not in the roster', () => {
    const store = new FleetStore(roster)

    store.applyEvents([report({ t: 1, robotId: 'ghost' })], 1)
    const snapshot = store.getSnapshot()

    expect(snapshot.robots).toHaveLength(2)
    expect(snapshot.unknownRobotReports).toBe(1)
  })

  it('bounds per robot history', () => {
    const store = new FleetStore(roster)
    for (let t = 1; t <= HISTORY_CAPACITY + 20; t++) {
      store.applyEvents([report({ t, robotId: 'r1' })], t)
    }

    const history = store.getSnapshot().robots[0].history
    expect(history).toHaveLength(HISTORY_CAPACITY)
    expect(history[history.length - 1].t).toBe(HISTORY_CAPACITY + 20)
  })

  it('samples the trend on a fixed grid even when reports skip several buckets', () => {
    const store = new FleetStore(roster)

    store.applyEvents([report({ t: 0, robotId: 'r1', status: 'active' })], 0)
    store.applyEvents([report({ t: 100, robotId: 'r1', status: 'error' })], 100)
    const trend = store.getSnapshot().trend

    expect(trend.map((sample) => sample.t)).toEqual([0, 15, 30, 45, 60, 75, 90])
    // The gap carries the last known state forward rather than leaving a hole.
    expect(trend[3].byStatus.active).toBe(1)
    expect(trend[3].byStatus.idle).toBe(1)
  })

  it('bounds the trend so a long running live feed cannot grow without limit', () => {
    const store = new FleetStore(roster)
    store.applyEvents([], TREND_BUCKET_SECONDS * (TREND_CAPACITY + 50))

    const trend = store.getSnapshot().trend
    expect(trend).toHaveLength(TREND_CAPACITY)
    expect(trend[0].t).toBeGreaterThan(0)
  })

  it('counts a robot as stale once it has been quiet for too long', () => {
    const store = new FleetStore(roster)
    store.applyEvents([report({ t: 0, robotId: 'r1' }), report({ t: 0, robotId: 'r2' })], 0)
    store.applyEvents([report({ t: 30, robotId: 'r1' })], 30)

    const snapshot = store.getSnapshot()
    const [r1, r2] = snapshot.robots
    expect(isStale(r1, snapshot.t)).toBe(false)
    expect(isStale(r2, snapshot.t)).toBe(true)
    expect(snapshot.t - (r2.lastReportT ?? 0)).toBeGreaterThan(THRESHOLDS.staleAfterSeconds)
  })

  it('hands out the same snapshot object until something changes', () => {
    const store = new FleetStore(roster)
    const first = store.getSnapshot()

    expect(store.getSnapshot()).toBe(first)
    store.applyEvents([report({ t: 1, robotId: 'r1' })], 1)
    expect(store.getSnapshot()).not.toBe(first)
  })
})

describe('the recorded log', () => {
  const events = parseEventLog(
    readFileSync(new URL('../../public/data/events.jsonl', import.meta.url), 'utf8'),
  ).events
  const recordedRoster = parseRoster(
    JSON.parse(readFileSync(new URL('../../public/data/robots.json', import.meta.url), 'utf8')),
  )

  function playTo(target: number, stepSeconds: number) {
    const store = new FleetStore(recordedRoster)
    const source = new ReplaySource(events)
    for (let t = 0; t < target; t += stepSeconds) {
      store.applyEvents(source.advanceTo(t), t)
    }
    store.applyEvents(source.advanceTo(target), target)
    return store.getSnapshot()
  }

  function seekTo(target: number) {
    const store = new FleetStore(recordedRoster)
    const source = new ReplaySource(events)
    store.applyEvents(source.advanceTo(target), target)
    return store.getSnapshot()
  }

  it('loads without dropping anything', () => {
    expect(events).toHaveLength(1448)
    expect(new Set(events.map((event) => event.robotId)).size).toBe(8)
  })

  it('ends with every robot having reported the whole window', () => {
    const snapshot = playTo(900, 0.5)

    expect(snapshot.reportsApplied).toBe(1448)
    expect(snapshot.lateReportsDropped).toBe(0)
    expect(snapshot.robots.every((robot) => robot.reports === 181)).toBe(true)
    expect(snapshot.robots.find((robot) => robot.id === 'r7')).toMatchObject({
      status: 'on_mission',
      battery: 16.6,
    })
  })

  // This is what the scrubber leans on: dragging to a point has to land on exactly
  // the state playing there would have produced, trend history included.
  it('seeking to a time matches playing to it', () => {
    for (const target of [0, 137, 452.5, 900]) {
      expect(seekTo(target)).toEqual(playTo(target, 0.37))
    }
  })
})
