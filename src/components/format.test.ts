import { describe, expect, it } from 'vitest'
import { formatClock, formatDuration } from './format'

describe('formatClock', () => {
  it('reads as minutes and seconds', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(65.7)).toBe('1:05')
    expect(formatClock(900)).toBe('15:00')
  })

  it('never goes negative', () => {
    expect(formatClock(-3)).toBe('0:00')
  })
})

describe('formatDuration', () => {
  it('drops the minutes when there are none', () => {
    expect(formatDuration(42)).toBe('42s')
    expect(formatDuration(60)).toBe('1m')
    expect(formatDuration(125)).toBe('2m 5s')
  })
})
