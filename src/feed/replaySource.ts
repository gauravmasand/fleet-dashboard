import type { RobotEvent } from '../domain/types'
import type { EventSource } from './source'

/** Plays the recorded log back against simulation time. */
export class ReplaySource implements EventSource {
  readonly kind = 'replay'
  readonly endT: number
  readonly startT: number
  private events: RobotEvent[]
  private index = 0

  constructor(events: readonly RobotEvent[]) {
    // Sorting is the source's job: the store assumes ascending t, and a recorded
    // file is not guaranteed to be in order just because this one is.
    this.events = [...events].sort((a, b) => a.t - b.t)
    this.startT = this.events.length > 0 ? this.events[0].t : 0
    this.endT = this.events.length > 0 ? this.events[this.events.length - 1].t : 0
  }

  advanceTo(simT: number): RobotEvent[] {
    const batch: RobotEvent[] = []
    while (this.index < this.events.length && this.events[this.index].t <= simT) {
      batch.push(this.events[this.index])
      this.index++
    }
    return batch
  }

  reset() {
    this.index = 0
  }
}
