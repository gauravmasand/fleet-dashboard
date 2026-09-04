import { describe, expect, it } from 'vitest'
import { STATUS_META, attentionReasons, isStale } from './status'
import { ROBOT_STATUSES, type RobotState, type RobotStatus } from './types'

function robot(overrides: Partial<RobotState> = {}): RobotState {
  return {
    id: 'r1',
    type: 'picker',
    x: 0,
    y: 0,
    status: 'idle',
    battery: 80,
    lastReportT: 100,
    trackedSince: 0,
    statusSince: 100,
    distance: 0,
    reports: 5,
    lastTask: null,
    history: [],
    ...overrides,
  }
}

describe('status taxonomy', () => {
  it('has a category for every status the log can contain', () => {
    for (const status of ROBOT_STATUSES) {
      expect(STATUS_META[status as RobotStatus]).toBeDefined()
    }
  })
})

describe('attentionReasons', () => {
  it('leaves a healthy robot alone', () => {
    expect(attentionReasons(robot(), 100)).toEqual([])
  })

  it('puts the most urgent reason first', () => {
    const reasons = attentionReasons(robot({ status: 'error', battery: 5 }), 100)

    expect(reasons.map((reason) => reason.code)).toEqual(['error', 'critical_battery'])
  })

  it('flags a low battery only while the robot is not charging', () => {
    expect(attentionReasons(robot({ battery: 15 }), 100).map((reason) => reason.code)).toEqual([
      'low_battery',
    ])
    expect(attentionReasons(robot({ battery: 15, status: 'charging' }), 100)).toEqual([])
  })

  it('flags silence, and counts it from when the robot was first tracked', () => {
    expect(attentionReasons(robot({ lastReportT: 100 }), 130)[0].code).toBe('stale')
    expect(isStale(robot({ lastReportT: null, trackedSince: 0 }), 10)).toBe(false)
    expect(attentionReasons(robot({ lastReportT: null, trackedSince: 0 }), 60)[0].label).toBe(
      'No telemetry yet',
    )
  })

  it('does not call a battery low before the robot has reported one', () => {
    expect(attentionReasons(robot({ lastReportT: null, battery: 0 }), 5)).toEqual([])
  })

  it('treats maintenance as planned work rather than an alarm', () => {
    expect(attentionReasons(robot({ status: 'maintenance' }), 100)).toEqual([])
    expect(attentionReasons(robot({ status: 'blocked' }), 100)[0].code).toBe('blocked')
  })
})
