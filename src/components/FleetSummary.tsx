import { CATEGORY_META, STATUS_CATEGORIES, THRESHOLDS, type StatusCategory } from '../domain/status'
import type { FleetSummary as Summary } from '../state/selectors'
import { formatPercent } from './format'

export type ListFilter = StatusCategory | 'flagged' | null

type Props = {
  summary: Summary
  filter: ListFilter
  onFilter: (filter: ListFilter) => void
}

export function FleetSummary({ summary, filter, onFilter }: Props) {
  const atRisk = summary.needsAttention - summary.byCategory.attention

  return (
    <div className="tiles">
      {STATUS_CATEGORIES.map((category) => {
        const isAttention = category === 'attention'
        const value = filter === category || (isAttention && filter === 'flagged')
        return (
          <button
            type="button"
            key={category}
            className={`tile${isAttention && summary.needsAttention > 0 ? ' tile--alarm' : ''}`}
            aria-pressed={value}
            onClick={() => {
              const next: ListFilter = isAttention ? 'flagged' : category
              onFilter(value ? null : next)
            }}
          >
            <span className="tile__value">{summary.byCategory[category]}</span>
            <span className="tile__label">
              <span
                className="swatch"
                style={{ background: CATEGORY_META[category].color }}
                aria-hidden="true"
              />
              {CATEGORY_META[category].label}
            </span>
            {isAttention && atRisk > 0 ? (
              <span className="tile__note alarm-text">+{atRisk} low or silent</span>
            ) : null}
          </button>
        )
      })}

      <div className="tile" aria-label="Average battery across the fleet">
        <span
          className="tile__value"
          style={summary.minBattery <= THRESHOLDS.lowBatteryPct ? { color: 'var(--attention)' } : undefined}
        >
          {summary.reporting > 0 ? formatPercent(summary.avgBattery) : '--'}
        </span>
        <span className="tile__label">
          Avg battery
          {summary.reporting > 0 ? ` (low ${formatPercent(summary.minBattery)})` : ''}
        </span>
      </div>
    </div>
  )
}
