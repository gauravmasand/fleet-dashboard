/**
 * Frames longer than this are treated as this long. A backgrounded tab stops
 * getting animation frames, and without the cap it would come back and
 * fast-forward the whole fleet in one step.
 */
const MAX_FRAME_MS = 250

/** The browser bits the clock needs, kept behind an interface so tests can drive it. */
export type FrameScheduler = {
  request(callback: (now: number) => void): number
  cancel(handle: number): void
  now(): number
}

export const animationFrameScheduler: FrameScheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
  now: () => performance.now(),
}

/**
 * Turns wall clock time into simulation time at a chosen rate. Both the replay
 * and the live feed are pulled from this, so "8x" means the same thing to each.
 */
export class SimClock {
  private listener: (t: number) => void
  private scheduler: FrameScheduler
  private frame: number | null = null
  private lastFrameMs = 0
  private simT = 0
  private rate = 1

  constructor(listener: (t: number) => void, scheduler: FrameScheduler = animationFrameScheduler) {
    this.listener = listener
    this.scheduler = scheduler
  }

  get time(): number {
    return this.simT
  }

  get speed(): number {
    return this.rate
  }

  get running(): boolean {
    return this.frame !== null
  }

  setSpeed(rate: number) {
    this.rate = Math.max(0, rate)
  }

  setTime(t: number) {
    this.simT = t
  }

  start() {
    if (this.frame !== null) return
    this.lastFrameMs = this.scheduler.now()
    this.frame = this.scheduler.request(this.onFrame)
  }

  stop() {
    if (this.frame === null) return
    this.scheduler.cancel(this.frame)
    this.frame = null
  }

  private onFrame = (now: number) => {
    const elapsed = Math.min(now - this.lastFrameMs, MAX_FRAME_MS)
    this.lastFrameMs = now
    this.simT += (elapsed / 1000) * this.rate
    this.listener(this.simT)
    if (this.frame !== null) this.frame = this.scheduler.request(this.onFrame)
  }
}
