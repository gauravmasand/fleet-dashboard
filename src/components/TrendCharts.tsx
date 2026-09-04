import { useState } from 'react'
import { CATEGORY_META, STATUS_CATEGORIES, STATUS_META, type StatusCategory } from '../domain/status'
import { ROBOT_STATUSES, type TrendSample } from '../domain/types'
import { useElementSize } from '../hooks/useElementSize'
import { linePath, linearScale, nearestIndex, stackedAreaPaths } from './charts'
import { formatClock, formatPercent } from './format'

const PAD = { left: 32, right: 14, top: 8, bottom: 18 }

type Props = {
  trend: readonly TrendSample[]
}

/**
 * Both charts share an x domain and a hovered sample, so reading one against the
 * other is a single mouse move rather than two.
 */
export function TrendCharts({ trend }: Props) {
  const [hovered, setHovered] = useState<number | null>(null)
  const enough = trend.length >= 2
  const index = hovered !== null && hovered < trend.length ? hovered : null

  return (
    <div className="trends">
      <div className="card">
        <div className="card__head">
          <span className="card__title">Fleet status mix</span>
          <span className="hint">share of the fleet, sampled every 15s</span>
        </div>
        {enough ? (
          <StatusMixChart trend={trend} hovered={index} onHover={setHovered} />
        ) : (
          <p className="hint">Collecting the first samples.</p>
        )}
        <div className="legend">
          {STATUS_CATEGORIES.map((category) => (
            <span className="legend__item" key={category}>
              <span
                className="swatch swatch--square"
                style={{ background: CATEGORY_META[category].color }}
              />
              {CATEGORY_META[category].label}
            </span>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card__head">
          <span className="card__title">Battery</span>
          <span className="hint">fleet average and weakest robot</span>
        </div>
        {enough ? (
          <BatteryChart trend={trend} hovered={index} onHover={setHovered} />
        ) : (
          <p className="hint">Collecting the first samples.</p>
        )}
        <div className="legend">
          <span className="legend__item">
            <span className="swatch" style={{ background: 'var(--ink-secondary)' }} /> Average
          </span>
          <span className="legend__item">
            <span className="swatch" style={{ background: 'var(--attention)' }} /> Weakest robot
          </span>
        </div>
      </div>
    </div>
  )
}

type ChartProps = {
  trend: readonly TrendSample[]
  hovered: number | null
  onHover: (index: number | null) => void
}

function useChartGeometry(trend: readonly TrendSample[]) {
  const [ref, size] = useElementSize<HTMLDivElement>()
  const plotWidth = Math.max(0, size.width - PAD.left - PAD.right)
  const plotHeight = Math.max(0, size.height - PAD.top - PAD.bottom)
  const x = linearScale(trend[0].t, trend[trend.length - 1].t, 0, plotWidth)
  const xs = trend.map((sample) => x(sample.t))

  return { ref, size, plotWidth, plotHeight, xs }
}

function pointerIndex(event: React.PointerEvent<SVGSVGElement>, xs: number[]): number {
  const rect = event.currentTarget.getBoundingClientRect()
  return nearestIndex(xs, event.clientX - rect.left - PAD.left)
}

function StatusMixChart({ trend, hovered, onHover }: ChartProps) {
  const { ref, size, plotWidth, plotHeight, xs } = useChartGeometry(trend)

  const columns = trend.map((sample) => {
    const counts: Record<StatusCategory, number> = {
      working: 0,
      idle: 0,
      charging: 0,
      maintenance: 0,
      attention: 0,
    }
    for (const status of ROBOT_STATUSES) {
      counts[STATUS_META[status].category] += sample.byStatus[status]
    }
    return STATUS_CATEGORIES.map((category) => counts[category])
  })

  const paths = plotWidth > 0 ? stackedAreaPaths(columns, xs, plotHeight) : []
  const hoveredColumn = hovered !== null ? columns[hovered] : null
  const total = hoveredColumn ? hoveredColumn.reduce((sum, value) => sum + value, 0) : 0

  return (
    <div className="chart" ref={ref}>
      {size.width > 0 && (
        <svg
          viewBox={`0 0 ${size.width} ${size.height}`}
          onPointerMove={(event) => onHover(pointerIndex(event, xs))}
          onPointerLeave={() => onHover(null)}
        >
          <g transform={`translate(${PAD.left}, ${PAD.top})`}>
            {[0, 25, 50, 75, 100].map((tick) => (
              <g key={tick}>
                <line
                  className="chart__grid"
                  x1={0}
                  x2={plotWidth}
                  y1={plotHeight * (1 - tick / 100)}
                  y2={plotHeight * (1 - tick / 100)}
                />
                <text className="chart__axis-text" x={-6} y={plotHeight * (1 - tick / 100) + 3} textAnchor="end">
                  {tick}%
                </text>
              </g>
            ))}

            {paths.map((path, i) => (
              <path
                key={STATUS_CATEGORIES[i]}
                className="chart__band"
                d={path}
                fill={CATEGORY_META[STATUS_CATEGORIES[i]].color}
              />
            ))}

            {hovered !== null && (
              <line className="chart__crosshair" x1={xs[hovered]} x2={xs[hovered]} y1={0} y2={plotHeight} />
            )}

            <TimeAxis trend={trend} xs={xs} y={plotHeight} />
          </g>
        </svg>
      )}

      {hoveredColumn && total > 0 && (
        <div
          className="tooltip"
          style={{ left: Math.min(Math.max(xs[hovered!] + PAD.left - 60, 0), Math.max(size.width - 150, 0)) }}
        >
          <div className="tooltip__row">
            <span className="tooltip__label">{formatClock(trend[hovered!].t)}</span>
          </div>
          {STATUS_CATEGORIES.map((category, i) =>
            hoveredColumn[i] > 0 ? (
              <div className="tooltip__row" key={category}>
                <span className="tooltip__label">
                  <span className="swatch" style={{ background: CATEGORY_META[category].color }} />
                  {CATEGORY_META[category].label}
                </span>
                <span className="tooltip__value">
                  {hoveredColumn[i]} ({formatPercent((hoveredColumn[i] / total) * 100)})
                </span>
              </div>
            ) : null,
          )}
        </div>
      )}
    </div>
  )
}

function BatteryChart({ trend, hovered, onHover }: ChartProps) {
  const { ref, size, plotWidth, plotHeight, xs } = useChartGeometry(trend)
  const y = linearScale(0, 100, plotHeight, 0)

  // Leading samples taken before any robot had reported would otherwise draw a
  // line climbing out of zero that never happened.
  const withData = trend
    .map((sample, index) => ({ sample, index }))
    .filter((entry) => entry.sample.reporting > 0)
  const dataXs = withData.map((entry) => xs[entry.index])
  const average = linePath(dataXs, withData.map((entry) => y(entry.sample.avgBattery)))
  const weakest = linePath(dataXs, withData.map((entry) => y(entry.sample.minBattery)))
  const sample = hovered !== null && trend[hovered].reporting > 0 ? trend[hovered] : null

  return (
    <div className="chart" ref={ref}>
      {size.width > 0 && (
        <svg
          viewBox={`0 0 ${size.width} ${size.height}`}
          onPointerMove={(event) => onHover(pointerIndex(event, xs))}
          onPointerLeave={() => onHover(null)}
        >
          <g transform={`translate(${PAD.left}, ${PAD.top})`}>
            {[0, 50, 100].map((tick) => (
              <g key={tick}>
                <line className="chart__grid" x1={0} x2={plotWidth} y1={y(tick)} y2={y(tick)} />
                <text className="chart__axis-text" x={-6} y={y(tick) + 3} textAnchor="end">
                  {tick}%
                </text>
              </g>
            ))}

            <line
              className="chart__grid"
              x1={0}
              x2={plotWidth}
              y1={y(20)}
              y2={y(20)}
              stroke="var(--attention)"
              strokeDasharray="4 4"
              strokeOpacity={0.7}
            />

            <path className="chart__line" d={average} stroke="var(--ink-secondary)" />
            <path className="chart__line" d={weakest} stroke="var(--attention)" strokeDasharray="4 3" />

            {hovered !== null && (
              <line className="chart__crosshair" x1={xs[hovered]} x2={xs[hovered]} y1={0} y2={plotHeight} />
            )}

            <TimeAxis trend={trend} xs={xs} y={plotHeight} />
          </g>
        </svg>
      )}

      {sample && (
        <div
          className="tooltip"
          style={{ left: Math.min(Math.max(xs[hovered!] + PAD.left - 60, 0), Math.max(size.width - 150, 0)) }}
        >
          <div className="tooltip__row">
            <span className="tooltip__label">{formatClock(sample.t)}</span>
          </div>
          <div className="tooltip__row">
            <span className="tooltip__label">Average</span>
            <span className="tooltip__value">{formatPercent(sample.avgBattery)}</span>
          </div>
          <div className="tooltip__row">
            <span className="tooltip__label">Weakest</span>
            <span className="tooltip__value">{formatPercent(sample.minBattery)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function TimeAxis({ trend, xs, y }: { trend: readonly TrendSample[]; xs: number[]; y: number }) {
  const ticks = [0, Math.floor(trend.length / 2), trend.length - 1]

  return (
    <g>
      {ticks.map((index, position) => (
        <text
          key={index}
          className="chart__axis-text"
          x={xs[index]}
          y={y + 14}
          textAnchor={position === 0 ? 'start' : position === ticks.length - 1 ? 'end' : 'middle'}
        >
          {formatClock(trend[index].t)}
        </text>
      ))}
    </g>
  )
}
