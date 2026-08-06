import { describe, it, expect } from 'vitest'
import { resolveWindow, filterPlays, bucketPlays, chooseBucket } from './window.js'

const DAY = 86400000
// A fixed "now" so every expectation below can be worked out by hand.
const NOW = Date.UTC(2026, 7, 6) // 6 August 2026, midnight UTC

function play(ts, msPlayed = 180000) {
  return { key: `${ts}|x`, ts, msPlayed, trackUri: 'x', artistName: 'A' }
}

describe('resolveWindow', () => {
  it('spans exactly seven days for the 7 day preset', () => {
    const w = resolveWindow('7d', { now: NOW })
    expect(w.to - w.from).toBe(7 * DAY)
    expect(w.to).toBe(NOW)
    expect(w.bucket).toBe('day')
  })

  it('puts the previous period immediately before, at the same length', () => {
    const w = resolveWindow('30d', { now: NOW })
    expect(w.previous.to).toBe(w.from)
    expect(w.previous.to - w.previous.from).toBe(w.to - w.from)
  })

  it('starts this year on 1 January', () => {
    const w = resolveWindow('year', { now: NOW })
    expect(w.from).toBe(Date.UTC(2026, 0, 1))
  })

  it('covers the whole dataset for all time, and offers no comparison', () => {
    const range = { from: Date.UTC(2022, 0, 5), to: Date.UTC(2026, 6, 30) }
    const w = resolveWindow('all', { now: NOW, dataRange: range })
    expect(w.from).toBe(range.from)
    expect(w.to).toBeGreaterThan(range.to)
    // There is no earlier period to compare all time against.
    expect(w.previous).toBeNull()
  })

  it('falls back to the default preset when given an unknown id', () => {
    const w = resolveWindow('nonsense', { now: NOW })
    expect(w.to - w.from).toBe(30 * DAY)
  })
})

describe('chooseBucket', () => {
  it('picks a granularity that keeps the point count sensible', () => {
    expect(chooseBucket(NOW - DAY, NOW)).toBe('hour')
    expect(chooseBucket(NOW - 30 * DAY, NOW)).toBe('day')
    expect(chooseBucket(NOW - 200 * DAY, NOW)).toBe('week')
    expect(chooseBucket(NOW - 1000 * DAY, NOW)).toBe('month')
  })
})

describe('filterPlays', () => {
  it('includes the start and excludes the end, so adjacent windows never double count', () => {
    const plays = [play(NOW - DAY), play(NOW), play(NOW + DAY)]
    const result = filterPlays(plays, NOW - DAY, NOW + DAY)
    expect(result).toHaveLength(2)
    expect(result.map((p) => p.ts)).toEqual([NOW - DAY, NOW])
  })
})

describe('bucketPlays', () => {
  it('keeps every play and every millisecond', () => {
    const plays = [
      play(NOW - 3 * DAY, 100),
      play(NOW - 3 * DAY + 3600000, 200),
      play(NOW - DAY, 300),
    ]
    const buckets = bucketPlays(plays, NOW - 4 * DAY, NOW, 'day')
    const totalPlays = buckets.reduce((s, b) => s + b.plays, 0)
    const totalMs = buckets.reduce((s, b) => s + b.msPlayed, 0)
    expect(totalPlays).toBe(3)
    expect(totalMs).toBe(600)
  })

  it('produces one bucket per day across the window', () => {
    const buckets = bucketPlays([], NOW - 4 * DAY, NOW, 'day')
    expect(buckets).toHaveLength(4)
  })

  it('keeps empty buckets, because a gap in listening is information', () => {
    const plays = [play(NOW - 3 * DAY)]
    const buckets = bucketPlays(plays, NOW - 4 * DAY, NOW, 'day')
    const empty = buckets.filter((b) => b.plays === 0)
    expect(empty).toHaveLength(3)
  })

  it('groups the two plays on the same day together', () => {
    const plays = [play(NOW - 3 * DAY), play(NOW - 3 * DAY + 3600000)]
    const buckets = bucketPlays(plays, NOW - 4 * DAY, NOW, 'day')
    const busiest = buckets.find((b) => b.plays > 0)
    expect(busiest.plays).toBe(2)
  })

  it('starts weekly buckets on a Monday', () => {
    const buckets = bucketPlays([], NOW - 21 * DAY, NOW, 'week')
    for (const b of buckets) {
      expect(new Date(b.ts).getUTCDay()).toBe(1)
    }
  })

  it('starts monthly buckets on the first of the month', () => {
    const buckets = bucketPlays([], Date.UTC(2026, 0, 15), Date.UTC(2026, 4, 2), 'month')
    for (const b of buckets) {
      expect(new Date(b.ts).getUTCDate()).toBe(1)
    }
  })
})
