import type { RobotEvent } from '../domain/types'

/**
 * Anything the dashboard can watch. The replay and the live generator both
 * implement this, which is what lets one store and one set of views serve both.
 */
export type EventSource = {
  readonly kind: 'replay' | 'live'
  /** Simulation time of the last available event, or null if the source never ends. */
  readonly endT: number | null
  /** Every event with t <= simT that has not been handed out yet, ascending by t. */
  advanceTo(simT: number): RobotEvent[]
  /** Rewinds to the beginning so the same source can be replayed. */
  reset(): void
}
