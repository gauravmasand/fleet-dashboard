import { describe, expect, it } from 'vitest'
import type { FrameScheduler } from '../feed/clock'
import type { Robot, RobotEvent } from '../domain/types'
import { FleetController } from './fleetController'

/** Lets a test step playback frame by frame instead of waiting on the browser. */
function manualScheduler() {
  let now = 0
  let pending: ((now: number) => void) | null = null

  const scheduler: FrameScheduler = {
    request(callback) {
      pending = callback
      return 1
    },
    cancel() {
      pending = null
    },
    now: () => now,
  }

  // Frames longer than the clock's cap would be clamped, so step in small ones.
  function advance(ms: number) {
    for (let elapsed = 0; elapsed < ms; elapsed += 100) {
      now += 100
      const frame = pending
      pending = null
      frame?.(now)
    }
  }

  return { scheduler, advance }
}

const roster: Robot[] = [
  { id: 'r1', type: 'picker', start: { x: 10, y: 10 } },
  { id: 'r2', type: 'hauler', start: { x: 20, y: 20 } },
]

const recorded: RobotEvent[] = []
for (let t = 0; t <= 100; t += 5) {
  recorded.push({ t, robotId: 'r1', x: 10 + t, y: 10, status: 'active', battery: 90 - t / 10 })
  recorded.push({ t, robotId: 'r2', x: 20, y: 20, status: 'idle', battery: 50 })
}

describe('FleetController', () => {
  it('starts on the recorded window', () => {
    const state = new FleetController(roster, recorded, { scheduler: manualScheduler().scheduler }).getState()

    expect(state.feed).toBe('replay')
    expect(state.endT).toBe(100)
    expect(state.playing).toBe(false)
  })

  it('seeks to a point in the recording', () => {
    const controller = new FleetController(roster, recorded, { scheduler: manualScheduler().scheduler })
    controller.seek(50)
    const state = controller.getState()

    expect(state.fleet.t).toBe(50)
    expect(state.fleet.robots[0]).toMatchObject({ x: 60, status: 'active' })
  })

  it('carries the fleet across when the operator switches to the live feed', () => {
    const controller = new FleetController(roster, recorded, { scheduler: manualScheduler().scheduler })
    controller.seek(100)
    const before = controller.getState().fleet

    controller.setFeed('live')
    const after = controller.getState()

    expect(after.endT).toBeNull()
    expect(after.fleet.robots[0].x).toBe(before.robots[0].x)
    expect(after.fleet.trend).toEqual(before.trend)
  })

  it('starts the recording over when the operator switches back to it', () => {
    const controller = new FleetController(roster, recorded, { scheduler: manualScheduler().scheduler })
    controller.seek(100)
    controller.setFeed('live')
    controller.setFeed('replay')
    const state = controller.getState()

    expect(state.fleet.t).toBe(0)
    expect(state.fleet.robots[0]).toMatchObject({ x: 10, lastReportT: null })
    expect(state.endT).toBe(100)
  })

  it('ignores a seek while the live feed is running', () => {
    const controller = new FleetController(roster, recorded, { scheduler: manualScheduler().scheduler })
    controller.seek(100)
    controller.setFeed('live')
    controller.seek(20)

    expect(controller.getState().fleet.t).toBe(100)
  })

  it('plays the recording forward and stops at the end of the window', () => {
    const { scheduler, advance } = manualScheduler()
    const controller = new FleetController(roster, recorded, { scheduler })

    controller.setSpeed(10)
    controller.play()
    advance(11000)

    expect(controller.getState().fleet.t).toBe(100)
    expect(controller.getState().playing).toBe(false)
    expect(controller.getState().fleet.reportsApplied).toBe(recorded.length)
  })

  it('keeps generating events once the live feed takes over', () => {
    const { scheduler, advance } = manualScheduler()
    const controller = new FleetController(roster, recorded, { scheduler })

    controller.seek(100)
    const beforeReports = controller.getState().fleet.reportsApplied
    controller.setFeed('live')
    advance(2000)
    const after = controller.getState()

    expect(after.playing).toBe(true)
    expect(after.fleet.t).toBeGreaterThan(100)
    expect(after.fleet.reportsApplied).toBeGreaterThan(beforeReports)
  })
})
