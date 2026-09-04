import { CATEGORY_META, STATUS_META, attentionReasons, isStale } from '../domain/status'
import { ROBOT_RADIUS, SITE } from '../domain/site'
import type { RobotState } from '../domain/types'
import { formatPercent } from './format'

type Props = {
  robots: readonly RobotState[]
  clockT: number
  selectedId: string | null
  onSelect: (id: string | null) => void
  /** Matches the gap between reports, so robots glide instead of teleporting. */
  transitionMs: number
  layoutUrl: string
}

const TRAIL_POINTS = 30

export function SiteMap({ robots, clockT, selectedId, onSelect, transitionMs, layoutUrl }: Props) {
  const selected = robots.find((robot) => robot.id === selectedId) ?? null

  return (
    <>
      <div className="map">
        <svg
          viewBox={`0 0 ${SITE.width} ${SITE.height}`}
          role="group"
          aria-label="Site map with robot positions"
          onClick={() => onSelect(null)}
        >
          <image href={layoutUrl} x={0} y={0} width={SITE.width} height={SITE.height} />

          {selected && selected.history.length > 1 && (
            <polyline
              points={selected.history
                .slice(-TRAIL_POINTS)
                .map((point) => `${point.x},${point.y}`)
                .join(' ')}
              fill="none"
              stroke={CATEGORY_META[STATUS_META[selected.status].category].color}
              strokeWidth={2}
              strokeOpacity={0.45}
              strokeLinecap="round"
            />
          )}

          {robots.map((robot) => (
            <Marker
              key={robot.id}
              robot={robot}
              clockT={clockT}
              selected={robot.id === selectedId}
              transitionMs={transitionMs}
              onSelect={onSelect}
            />
          ))}
        </svg>
      </div>

      <div className="legend">
        {Object.entries(CATEGORY_META).map(([category, meta]) => (
          <span className="legend__item" key={category}>
            <span
              className={`swatch${category === 'maintenance' ? ' swatch--hollow' : ''}`}
              style={{ background: meta.color }}
            />
            {meta.label}
          </span>
        ))}
        <span className="legend__item">
          <span className="swatch" style={{ background: 'var(--ink-muted)' }} /> Picker
        </span>
        <span className="legend__item">
          <span className="swatch swatch--square" style={{ background: 'var(--ink-muted)' }} /> Hauler
        </span>
      </div>
    </>
  )
}

type MarkerProps = {
  robot: RobotState
  clockT: number
  selected: boolean
  transitionMs: number
  onSelect: (id: string) => void
}

function Marker({ robot, clockT, selected, transitionMs, onSelect }: MarkerProps) {
  const meta = STATUS_META[robot.status]
  const color = CATEGORY_META[meta.category].color
  const stale = isStale(robot, clockT)
  const flagged = attentionReasons(robot, clockT).length > 0
  // Hollow carries "not in service" without leaning on colour alone.
  const hollow = meta.category === 'maintenance' || stale
  const isHauler = robot.type === 'hauler'

  return (
    <g
      className="marker"
      style={{
        transform: `translate(${robot.x}px, ${robot.y}px)`,
        transition: transitionMs > 0 ? `transform ${transitionMs}ms linear` : 'none',
      }}
      opacity={stale ? 0.75 : 1}
      onClick={(event) => {
        event.stopPropagation()
        onSelect(robot.id)
      }}
    >
      <title>
        {`${robot.id} (${robot.type}) - ${meta.label}, ${
          robot.lastReportT === null ? 'no report yet' : formatPercent(robot.battery)
        }`}
      </title>

      {flagged && (
        <circle className="marker__halo" r={ROBOT_RADIUS + 7} stroke={CATEGORY_META.attention.color} />
      )}
      {selected && <circle className="marker__selection" r={ROBOT_RADIUS + 4} />}

      {isHauler ? (
        <rect
          className={`marker__body${hollow ? ' marker__body--hollow' : ''}`}
          x={-ROBOT_RADIUS}
          y={-ROBOT_RADIUS}
          width={ROBOT_RADIUS * 2}
          height={ROBOT_RADIUS * 2}
          rx={3}
          fill={color}
          stroke={hollow ? color : undefined}
        />
      ) : (
        <circle
          className={`marker__body${hollow ? ' marker__body--hollow' : ''}`}
          r={ROBOT_RADIUS}
          fill={color}
          stroke={hollow ? color : undefined}
        />
      )}

      <text className="marker__label" y={ROBOT_RADIUS + 15}>
        {robot.id}
      </text>
    </g>
  )
}
