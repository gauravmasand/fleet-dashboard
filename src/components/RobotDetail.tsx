import { CATEGORY_META, STATUS_META, THRESHOLDS, attentionReasons, secondsSilent } from '../domain/status'
import type { RobotState } from '../domain/types'
import { linePath, linearScale } from './charts'
import { formatClock, formatDuration, formatPercent, formatPosition } from './format'

type Props = {
  robot: RobotState | null
  clockT: number
}

export function RobotDetail({ robot, clockT }: Props) {
  if (!robot) {
    return (
      <>
        <div className="card__head">
          <span className="card__title">Robot detail</span>
        </div>
        <p className="hint">Pick a robot on the map or in the list to see what it is doing.</p>
      </>
    )
  }

  const meta = STATUS_META[robot.status]
  const reasons = attentionReasons(robot, clockT)
  const reported = robot.lastReportT !== null
  const silence = secondsSilent(robot, clockT)

  return (
    <>
      <div className="card__head">
        <span className="card__title">Robot detail</span>
        <span className="hint">{robot.reports} reports</span>
      </div>

      <div className="detail">
        <div className="detail__head">
          <h2>{robot.id}</h2>
          <span className="status-chip">
            <span
              className="swatch"
              style={{ background: CATEGORY_META[meta.category].color }}
              aria-hidden="true"
            />
            {meta.label}
          </span>
          <span className="hint">{robot.type}</span>
        </div>

        {reasons.length > 0 && (
          <ul className="reasons">
            {reasons.map((reason) => (
              <li key={reason.code}>{reason.label}</li>
            ))}
          </ul>
        )}

        <dl className="detail__grid">
          <div className="detail__field">
            <dt>Battery</dt>
            <dd
              style={
                reported && robot.battery <= THRESHOLDS.lowBatteryPct
                  ? { color: 'var(--attention)' }
                  : undefined
              }
            >
              {reported ? formatPercent(robot.battery) : '--'}
            </dd>
          </div>
          <div className="detail__field">
            <dt>In this status for</dt>
            <dd>{formatDuration(clockT - robot.statusSince)}</dd>
          </div>
          <div className="detail__field">
            <dt>Position</dt>
            <dd>{formatPosition(robot.x, robot.y)}</dd>
          </div>
          <div className="detail__field">
            <dt>Distance covered</dt>
            <dd>{robot.distance.toFixed(0)} units</dd>
          </div>
          <div className="detail__field">
            <dt>Last report</dt>
            <dd>{reported ? `${formatDuration(silence)} ago` : 'never'}</dd>
          </div>
          <div className="detail__field">
            <dt>Last task event</dt>
            <dd>
              {robot.lastTask
                ? `${robot.lastTask.kind === 'task_started' ? 'Started' : 'Completed'} at ${formatClock(robot.lastTask.t)}`
                : 'none seen'}
            </dd>
          </div>
        </dl>

        <BatteryTrace robot={robot} />
      </div>
    </>
  )
}

const TRACE = { width: 320, height: 44 }

function BatteryTrace({ robot }: { robot: RobotState }) {
  if (robot.history.length < 2) return null

  const x = linearScale(
    robot.history[0].t,
    robot.history[robot.history.length - 1].t,
    0,
    TRACE.width,
  )
  const y = linearScale(0, 100, TRACE.height, 0)
  const path = linePath(
    robot.history.map((point) => x(point.t)),
    robot.history.map((point) => y(point.battery)),
  )

  return (
    <div>
      <span className="hint">Battery, last {robot.history.length} reports</span>
      <svg
        viewBox={`0 0 ${TRACE.width} ${TRACE.height}`}
        height={TRACE.height}
        width="100%"
        role="img"
        aria-label={`Battery went from ${robot.history[0].battery.toFixed(0)}% to ${robot.battery.toFixed(0)}%`}
      >
        <line
          className="chart__grid"
          x1={0}
          x2={TRACE.width}
          y1={y(THRESHOLDS.lowBatteryPct)}
          y2={y(THRESHOLDS.lowBatteryPct)}
          stroke="var(--attention)"
          strokeDasharray="3 3"
          strokeOpacity={0.6}
        />
        <path className="chart__line" d={path} stroke="var(--ink-secondary)" />
      </svg>
    </div>
  )
}
