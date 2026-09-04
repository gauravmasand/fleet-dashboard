import { CATEGORY_META, STATUS_META, THRESHOLDS, attentionReasons } from '../domain/status'
import type { RobotState } from '../domain/types'
import { formatPercent } from './format'

type Props = {
  robots: readonly RobotState[]
  clockT: number
  selectedId: string | null
  query: string
  onQuery: (query: string) => void
  onSelect: (id: string) => void
  subtitle: string
}

export function RobotList({ robots, clockT, selectedId, query, onQuery, onSelect, subtitle }: Props) {
  return (
    <>
      <div className="card__head">
        <span className="card__title">Robots</span>
        <span className="hint">{subtitle}</span>
      </div>

      <input
        className="search"
        type="search"
        value={query}
        placeholder="Search by id, type or status"
        aria-label="Search robots"
        onChange={(event) => onQuery(event.target.value)}
      />

      {robots.length === 0 ? (
        <p className="hint">Nothing matches that.</p>
      ) : (
        <ul className="robot-list">
          {robots.map((robot) => (
            <li key={robot.id}>
              <Row
                robot={robot}
                clockT={clockT}
                selected={robot.id === selectedId}
                onSelect={onSelect}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

type RowProps = {
  robot: RobotState
  clockT: number
  selected: boolean
  onSelect: (id: string) => void
}

function Row({ robot, clockT, selected, onSelect }: RowProps) {
  const meta = STATUS_META[robot.status]
  // The status chip already says "Blocked"; only spell out a reason that adds
  // something the chip does not already show.
  const reason = attentionReasons(robot, clockT).find((entry) => entry.code !== robot.status)
  const reported = robot.lastReportT !== null
  const low = reported && robot.battery <= THRESHOLDS.lowBatteryPct

  return (
    <button
      type="button"
      className="robot-row"
      aria-current={selected ? 'true' : undefined}
      onClick={() => onSelect(robot.id)}
    >
      <span className="robot-row__id">{robot.id}</span>

      <span>
        <span className="status-chip">
          <span
            className="swatch"
            style={{ background: CATEGORY_META[meta.category].color }}
            aria-hidden="true"
          />
          {meta.label}
        </span>
        <span className="robot-row__meta">
          {reason ? <span className="alarm-text"> &middot; {reason.label}</span> : ` · ${robot.type}`}
        </span>
      </span>

      <span>
        <span className={`robot-row__battery${low ? ' alarm-text' : ''}`}>
          {reported ? formatPercent(robot.battery) : '--'}
        </span>
        <span className="battery-bar">
          <span
            className="battery-bar__fill"
            style={{
              width: `${reported ? robot.battery : 0}%`,
              background: low ? 'var(--attention)' : 'var(--ink-muted)',
            }}
          />
        </span>
      </span>
    </button>
  )
}
