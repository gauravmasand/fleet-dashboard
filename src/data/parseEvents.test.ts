import { describe, expect, it } from 'vitest'
import { parseEventLog, parseRoster } from './parseEvents'

describe('parseEventLog', () => {
  it('reads a well formed line', () => {
    const { events, issues } = parseEventLog(
      '{"t": 55, "robot_id": "r6", "x": 602.7, "y": 344.8, "status": "on_mission", "battery": 43.7}',
    )

    expect(events).toEqual([
      { t: 55, robotId: 'r6', x: 602.7, y: 344.8, status: 'on_mission', battery: 43.7 },
    ])
    expect(issues.malformedJson).toBe(0)
  })

  it('keeps the task_event key when it is one we know', () => {
    const { events } = parseEventLog(
      '{"t": 1, "robot_id": "r1", "x": 1, "y": 2, "status": "idle", "battery": 50, "task_event": "task_started"}\n' +
        '{"t": 2, "robot_id": "r1", "x": 1, "y": 2, "status": "idle", "battery": 50, "task_event": "nonsense"}',
    )

    expect(events[0].taskEvent).toBe('task_started')
    expect(events[1].taskEvent).toBeUndefined()
  })

  it('drops bad lines without losing the good ones around them', () => {
    const text = [
      '',
      '   ',
      'not json at all',
      '[1, 2, 3]',
      '{"t": 1, "robot_id": "r1", "x": 1, "y": 2, "status": "idle", "battery": 50}',
      '{"t": 2, "robot_id": "r1", "x": null, "y": 2, "status": "idle", "battery": 50}',
      '{"t": 3, "robot_id": "r1", "x": 1, "y": 2, "status": "napping", "battery": 50}',
      '{"t": 4, "x": 1, "y": 2, "status": "idle", "battery": 50}',
      '{"t": 5, "robot_id": "r2", "x": 1, "y": 2, "status": "idle", "battery": 50}',
      '',
    ].join('\n')

    const { events, issues } = parseEventLog(text)

    expect(events.map((event) => event.t)).toEqual([1, 5])
    expect(issues.malformedJson).toBe(1)
    expect(issues.invalidShape).toBe(3)
    expect(issues.unknownStatus).toBe(1)
    expect(issues.samples.length).toBeGreaterThan(0)
  })

  it('survives CRLF line endings', () => {
    const { events } = parseEventLog(
      '{"t": 1, "robot_id": "r1", "x": 1, "y": 2, "status": "idle", "battery": 50}\r\n',
    )
    expect(events).toHaveLength(1)
  })

  it('clamps a battery reading that is out of range instead of dropping the report', () => {
    const { events } = parseEventLog(
      '{"t": 1, "robot_id": "r1", "x": 1, "y": 2, "status": "idle", "battery": 140}\n' +
        '{"t": 2, "robot_id": "r1", "x": 1, "y": 2, "status": "idle", "battery": -5}',
    )
    expect(events.map((event) => event.battery)).toEqual([100, 0])
  })

  it('returns nothing for an empty file', () => {
    expect(parseEventLog('').events).toEqual([])
    expect(parseEventLog('\n\n').events).toEqual([])
  })
})

describe('parseRoster', () => {
  it('reads the roster and defaults a missing type', () => {
    const roster = parseRoster([
      { robot_id: 'r1', robot_type: 'picker', start: { x: 1, y: 2 } },
      { robot_id: 'r2', start: {} },
      { robot_id: '', robot_type: 'hauler', start: { x: 0, y: 0 } },
      'garbage',
    ])

    expect(roster).toEqual([
      { id: 'r1', type: 'picker', start: { x: 1, y: 2 } },
      { id: 'r2', type: 'unknown', start: { x: 0, y: 0 } },
    ])
  })

  it('refuses a roster it cannot use', () => {
    expect(() => parseRoster({})).toThrow(/expected an array/)
    expect(() => parseRoster([])).toThrow(/no usable robots/)
  })
})
