import { DEFAULT_REPORT_INTERVAL } from '../feed/liveSource'
import { SPEED_OPTIONS, type FleetController, type DashboardState } from '../state/fleetController'
import { formatClock } from './format'

type Props = {
  state: DashboardState
  controller: FleetController
  /** Lines the parser had to throw away, surfaced rather than swallowed. */
  skippedLines: number
}

export function TopBar({ state, controller, skippedLines }: Props) {
  const { fleet, feed, playing, speed, endT } = state
  const atEnd = endT !== null && fleet.t >= endT

  return (
    <header className="topbar">
      <div className="topbar__brand">
        <h1>Fleet Dashboard</h1>
        <span className="hint">Site A &middot; {fleet.robots.length} robots</span>
      </div>

      <div className="control">
        <span className="control__label">Feed</span>
        <div className="segmented" role="group" aria-label="Event source">
          <button
            type="button"
            aria-pressed={feed === 'replay'}
            onClick={() => controller.setFeed('replay')}
          >
            Recorded
          </button>
          <button
            type="button"
            aria-pressed={feed === 'live'}
            onClick={() => controller.setFeed('live')}
          >
            Live
          </button>
        </div>
      </div>

      <div className="control">
        <button type="button" className="button" onClick={() => controller.togglePlay()}>
          {playing ? 'Pause' : atEnd ? 'Replay' : 'Play'}
        </button>
        <select
          className="select"
          aria-label="Playback speed"
          value={speed}
          onChange={(event) => controller.setSpeed(Number(event.target.value))}
        >
          {SPEED_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}x
            </option>
          ))}
        </select>
      </div>

      <span className="clock">
        {formatClock(fleet.t)}
        {endT !== null ? ` / ${formatClock(endT)}` : ''}
      </span>

      {feed === 'replay' && endT !== null ? (
        <input
          className="scrubber"
          type="range"
          min={0}
          max={endT}
          step={1}
          value={Math.min(fleet.t, endT)}
          aria-label="Scrub the recorded window"
          onPointerDown={() => controller.pause()}
          onChange={(event) => controller.seek(Number(event.target.value))}
        />
      ) : (
        <span className="control">
          <span className="live-dot" aria-hidden="true" />
          <span className="hint">
            Generated feed &middot; {1 / DEFAULT_REPORT_INTERVAL} report/robot/s at 1x
          </span>
        </span>
      )}

      <div className="topbar__spacer" />

      <div className="topbar__stats">
        <span>{fleet.reportsApplied.toLocaleString()} reports</span>
        {fleet.lateReportsDropped > 0 && <span>{fleet.lateReportsDropped} late</span>}
        {fleet.unknownRobotReports > 0 && <span>{fleet.unknownRobotReports} unknown</span>}
        {skippedLines > 0 && <span>{skippedLines} lines skipped</span>}
      </div>
    </header>
  )
}
