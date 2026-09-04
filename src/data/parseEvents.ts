import { ROBOT_STATUSES, type Robot, type RobotEvent, type RobotStatus, type TaskEventKind } from '../domain/types'

const STATUS_SET = new Set<string>(ROBOT_STATUSES)
const TASK_EVENTS = new Set<string>(['task_started', 'task_completed'])

export type ParseIssues = {
  malformedJson: number
  invalidShape: number
  unknownStatus: number
  /** First few problems, for the console and the footer readout. */
  samples: string[]
}

export type ParsedLog = {
  events: RobotEvent[]
  issues: ParseIssues
}

const MAX_SAMPLES = 5

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function note(issues: ParseIssues, message: string) {
  if (issues.samples.length < MAX_SAMPLES) issues.samples.push(message)
}

/**
 * Reads the JSONL telemetry log. A bad line loses that one report rather than the
 * whole file, because a dashboard that blanks out on one corrupt record is worse
 * than one that drops a sample.
 */
export function parseEventLog(text: string): ParsedLog {
  const issues: ParseIssues = { malformedJson: 0, invalidShape: 0, unknownStatus: 0, samples: [] }
  const events: RobotEvent[] = []
  const lines = text.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line === '') continue

    let raw: unknown
    try {
      raw = JSON.parse(line)
    } catch {
      issues.malformedJson++
      note(issues, `line ${i + 1}: not valid JSON`)
      continue
    }

    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      issues.invalidShape++
      note(issues, `line ${i + 1}: expected a JSON object`)
      continue
    }

    const record = raw as Record<string, unknown>
    const { t, robot_id: robotId, x, y, status, battery } = record

    if (!isFiniteNumber(t) || typeof robotId !== 'string' || robotId === '') {
      issues.invalidShape++
      note(issues, `line ${i + 1}: missing or invalid t/robot_id`)
      continue
    }
    if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(battery)) {
      issues.invalidShape++
      note(issues, `line ${i + 1}: missing or invalid x/y/battery for ${robotId}`)
      continue
    }
    if (typeof status !== 'string' || !STATUS_SET.has(status)) {
      issues.unknownStatus++
      note(issues, `line ${i + 1}: unknown status ${JSON.stringify(status)} for ${robotId}`)
      continue
    }

    const taskEvent = record.task_event
    events.push({
      t,
      robotId,
      x,
      y,
      status: status as RobotStatus,
      // A percentage outside 0-100 is a sensor glitch, not a reason to throw the
      // position away.
      battery: Math.min(100, Math.max(0, battery)),
      ...(typeof taskEvent === 'string' && TASK_EVENTS.has(taskEvent)
        ? { taskEvent: taskEvent as TaskEventKind }
        : {}),
    })
  }

  return { events, issues }
}

export function parseRoster(raw: unknown): Robot[] {
  if (!Array.isArray(raw)) {
    throw new Error('robots.json: expected an array of robots')
  }

  const robots: Robot[] = []
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue
    const record = entry as Record<string, unknown>
    const id = record.robot_id
    const type = record.robot_type
    const start = record.start as Record<string, unknown> | undefined

    if (typeof id !== 'string' || id === '') continue
    robots.push({
      id,
      type: typeof type === 'string' && type !== '' ? type : 'unknown',
      start: {
        x: isFiniteNumber(start?.x) ? start.x : 0,
        y: isFiniteNumber(start?.y) ? start.y : 0,
      },
    })
  }

  if (robots.length === 0) {
    throw new Error('robots.json: no usable robots in the roster')
  }
  return robots
}
