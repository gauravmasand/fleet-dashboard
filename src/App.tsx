import { useEffect, useMemo, useState } from 'react'
import { FleetSummary, type ListFilter } from './components/FleetSummary'
import { RobotDetail } from './components/RobotDetail'
import { RobotList } from './components/RobotList'
import { SiteMap } from './components/SiteMap'
import { TopBar } from './components/TopBar'
import { TrendCharts } from './components/TrendCharts'
import { loadFleetData, type FleetData } from './data/loadFleet'
import { CATEGORY_META, STATUS_META, attentionReasons } from './domain/status'
import { DEFAULT_REPORT_INTERVAL } from './feed/liveSource'
import { useDashboard } from './hooks/useDashboard'
import { matchesQuery, rankByAttention, summarise } from './state/selectors'

/** Gap between reports in the recorded log, used to pace the marker animation. */
const RECORDED_CADENCE_SECONDS = 5

type LoadState =
  | { status: 'loading' }
  | { status: 'failed'; message: string }
  | { status: 'ready'; data: FleetData }

export default function App() {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    loadFleetData()
      .then((data) => {
        if (!cancelled) setLoad({ status: 'ready', data })
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoad({ status: 'failed', message: error instanceof Error ? error.message : String(error) })
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (load.status === 'loading') {
    return (
      <div className="centred">
        <p className="hint">Loading the fleet...</p>
      </div>
    )
  }

  if (load.status === 'failed') {
    return (
      <div className="centred">
        <p className="error">Could not load the fleet data.</p>
        <p className="hint">{load.message}</p>
      </div>
    )
  }

  return <Dashboard data={load.data} />
}

function Dashboard({ data }: { data: FleetData }) {
  const [state, controller] = useDashboard(data.roster, data.events)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ListFilter>(null)

  const { fleet } = state
  const summary = useMemo(() => summarise(fleet), [fleet])

  const visible = useMemo(() => {
    const ranked = rankByAttention(fleet.robots, fleet.t)
    return ranked.filter((robot) => {
      if (!matchesQuery(robot, query)) return false
      if (filter === null) return true
      if (filter === 'flagged') return attentionReasons(robot, fleet.t).length > 0
      return STATUS_META[robot.status].category === filter
    })
  }, [fleet, query, filter])

  const selected = fleet.robots.find((robot) => robot.id === selectedId) ?? null
  const cadence = state.feed === 'replay' ? RECORDED_CADENCE_SECONDS : DEFAULT_REPORT_INTERVAL
  const transitionMs = state.playing ? Math.min(1500, (cadence / state.speed) * 1000) : 0
  const skippedLines =
    data.issues.malformedJson + data.issues.invalidShape + data.issues.unknownStatus

  return (
    <div className="app">
      <TopBar state={state} controller={controller} skippedLines={skippedLines} />

      <main className="main">
        <div className="column column--map">
          <section className="card">
            <div className="card__head">
              <span className="card__title">Site</span>
              <span className="hint">
                {state.feed === 'replay' ? 'Recorded window' : 'Live feed'} &middot; click a robot for detail
              </span>
            </div>
            <SiteMap
              robots={fleet.robots}
              clockT={fleet.t}
              selectedId={selectedId}
              onSelect={setSelectedId}
              transitionMs={transitionMs}
              layoutUrl={`${import.meta.env.BASE_URL}data/layout.png`}
            />
          </section>

          <TrendCharts trend={fleet.trend} />
        </div>

        <div className="column column--side">
          <section className="card">
            <div className="card__head">
              <span className="card__title">Fleet</span>
              <span className="hint">tap a tile to filter</span>
            </div>
            <FleetSummary summary={summary} filter={filter} onFilter={setFilter} />
          </section>

          <section className="card">
            <RobotList
              robots={visible}
              clockT={fleet.t}
              selectedId={selectedId}
              query={query}
              onQuery={setQuery}
              onSelect={setSelectedId}
              subtitle={describeFilter(filter, visible.length, fleet.robots.length)}
            />
          </section>

          <section className="card">
            <RobotDetail robot={selected} clockT={fleet.t} />
          </section>
        </div>
      </main>
    </div>
  )
}

function describeFilter(filter: ListFilter, shown: number, total: number): string {
  if (filter === null) return `${shown} of ${total}`
  const label = filter === 'flagged' ? 'needing attention' : CATEGORY_META[filter].label.toLowerCase()
  return `${shown} ${label}`
}
