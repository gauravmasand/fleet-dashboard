import { LiveSource } from '../feed/liveSource'
import { ReplaySource } from '../feed/replaySource'
import { SimClock, type FrameScheduler } from '../feed/clock'
import type { EventSource } from '../feed/source'
import type { FleetSnapshot, Robot, RobotEvent } from '../domain/types'
import { FleetStore } from './fleetStore'

export type FeedKind = 'replay' | 'live'

export const SPEED_OPTIONS = [1, 2, 5, 10, 20, 50]
export const DEFAULT_SPEED = 10
/** Fixed so a demo, and the tests, replay the same live feed every time. */
export const DEFAULT_LIVE_SEED = 20260904

export type ControllerOptions = {
  liveSeed?: number
  /** Injected by tests so playback can be stepped without animation frames. */
  scheduler?: FrameScheduler
}

export type DashboardState = {
  fleet: FleetSnapshot
  feed: FeedKind
  playing: boolean
  speed: number
  /** End of the recorded window; null while the live feed is running. */
  endT: number | null
}

/**
 * Owns the clock, the current source and the store, and is the only thing the UI
 * talks to. Swapping the recorded log for the live generator is a one line change
 * in here because both sides of it speak RobotEvent.
 */
export class FleetController {
  private store: FleetStore
  private clock: SimClock
  private source: EventSource
  private replay: ReplaySource
  private roster: readonly Robot[]
  private feed: FeedKind = 'replay'
  private liveSeed: number
  private listeners = new Set<() => void>()
  private state: DashboardState
  private stateStale = true

  constructor(
    roster: readonly Robot[],
    recorded: readonly RobotEvent[],
    options: ControllerOptions = {},
  ) {
    this.roster = roster
    this.liveSeed = options.liveSeed ?? DEFAULT_LIVE_SEED
    this.store = new FleetStore(roster)
    this.replay = new ReplaySource(recorded)
    this.source = this.replay
    this.clock = new SimClock((t) => this.onTick(t), options.scheduler)
    this.clock.setSpeed(DEFAULT_SPEED)
    this.store.subscribe(() => this.invalidate())
    this.state = this.buildState()
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getState = (): DashboardState => {
    if (this.stateStale) {
      this.state = this.buildState()
      this.stateStale = false
    }
    return this.state
  }

  play() {
    // Hitting play at the end of the recording should start it over rather than
    // sit there doing nothing.
    if (this.feed === 'replay' && this.source.endT !== null && this.clock.time >= this.source.endT) {
      this.seek(0)
    }
    this.clock.start()
    this.invalidate()
  }

  pause() {
    this.clock.stop()
    this.invalidate()
  }

  togglePlay() {
    if (this.clock.running) this.pause()
    else this.play()
  }

  setSpeed(speed: number) {
    this.clock.setSpeed(speed)
    this.invalidate()
  }

  /** Replay only: rebuilds state from the start of the log, which is fast enough to do on every drag. */
  seek(t: number) {
    if (this.feed !== 'replay' || this.source.endT === null) return
    const target = Math.max(0, Math.min(t, this.source.endT))

    this.store.reset(0)
    this.source.reset()
    this.store.applyEvents(this.source.advanceTo(target), target)
    this.clock.setTime(target)
    this.invalidate()
  }

  setFeed(feed: FeedKind) {
    if (feed === this.feed) return
    this.feed = feed

    if (feed === 'live') {
      // Carry on from whatever is on screen, so the trend charts and the map do not
      // jump when an operator switches over at the end of the recording.
      this.source = new LiveSource({
        roster: this.roster,
        seed: this.liveSeed,
        startT: this.clock.time,
        initial: this.store.getSnapshot().robots,
      })
    } else {
      this.replay.reset()
      this.source = this.replay
      this.store.reset(0)
      this.clock.setTime(0)
    }

    // Picking a feed means you want to watch it, and the recording stops the clock
    // when it runs out.
    this.clock.start()
    this.invalidate()
  }

  /** Stops the animation frame loop; the controller is discarded with the view. */
  dispose() {
    this.clock.stop()
  }

  private onTick(t: number) {
    const end = this.source.endT
    if (end !== null && t >= end) {
      this.clock.setTime(end)
      this.clock.stop()
      this.store.applyEvents(this.source.advanceTo(end), end)
      this.invalidate()
      return
    }

    this.store.applyEvents(this.source.advanceTo(t), t)
  }

  private buildState(): DashboardState {
    return {
      fleet: this.store.getSnapshot(),
      feed: this.feed,
      playing: this.clock.running,
      speed: this.clock.speed,
      endT: this.source.endT,
    }
  }

  private invalidate() {
    this.stateStale = true
    for (const listener of this.listeners) listener()
  }
}
