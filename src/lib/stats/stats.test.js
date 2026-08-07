import { describe, it, expect } from 'vitest'
import { topTracks, topArtists, topAlbums, totals } from './leaderboards.js'
import { byHour, byWeekday, clock, calendar } from './rhythms.js'
import { buildSessions, sessionStats, listeningStreaks, longestRepeat, longestArtistStreak } from './sessions.js'
import { habits, skipByArtist, abandoned, playedOnce } from './behaviour.js'
import { byYear, artistOfEachYear, comparePeriods } from './compare.js'

const MIN = 60000

// A tiny hand-built dataset. Every expectation below was worked out on paper
// first — that is the point of keeping it small enough to hold in your head.
//
//   15 Jun 2026, 08:00  Alpha / "One"   / Record A   3 min
//   15 Jun 2026, 08:04  Alpha / "One"   / Record A   3 min   (repeat)
//   15 Jun 2026, 08:08  Alpha / "Two"   / Record A   3 min
//   15 Jun 2026, 21:00  Beta  / "Three" / Record B   6 min
//   16 Jun 2026, 08:00  Alpha / "One"   / Record A   3 min
//   16 Jun 2026, 22:00  Beta  / "Four"  / Record B   1 min   SKIPPED
//   18 Jun 2026, 08:00  Gamma / "Five"  / Record C   4 min
//
// Alpha: 4 plays, 12 min.  Beta: 2 plays, 7 min.  Gamma: 1 play, 4 min.
// "One" is the top track with 3 plays.
// Days listened: 15th, 16th, 18th — so the 17th breaks the streak at 2.

function p(y, mo, d, h, mi, artistName, trackName, albumName, minutes, skipped = false) {
  const ts = new Date(y, mo, d, h, mi).getTime()
  return {
    key: `${ts}|${trackName}`,
    ts,
    msPlayed: minutes * MIN,
    trackUri: `uri:${trackName}`,
    trackName,
    artistName,
    albumName,
    reasonStart: 'clickrow',
    reasonEnd: skipped ? 'fwdbtn' : 'trackdone',
    shuffle: false,
    skipped,
    offline: false,
    platform: 'android',
    country: 'AU',
    source: 'export',
  }
}

const FIXTURE = [
  p(2026, 5, 15, 8, 0, 'Alpha', 'One', 'Record A', 3),
  p(2026, 5, 15, 8, 4, 'Alpha', 'One', 'Record A', 3),
  p(2026, 5, 15, 8, 8, 'Alpha', 'Two', 'Record A', 3),
  p(2026, 5, 15, 21, 0, 'Beta', 'Three', 'Record B', 6),
  p(2026, 5, 16, 8, 0, 'Alpha', 'One', 'Record A', 3),
  p(2026, 5, 16, 22, 0, 'Beta', 'Four', 'Record B', 1, true),
  p(2026, 5, 18, 8, 0, 'Gamma', 'Five', 'Record C', 4),
]

describe('leaderboards', () => {
  it('ranks tracks by play count', () => {
    const result = topTracks(FIXTURE)
    expect(result[0].name).toBe('One')
    expect(result[0].plays).toBe(3)
    expect(result[0].rank).toBe(1)
  })

  it('ranks artists by play count and by time, and they can disagree', () => {
    const byPlays = topArtists(FIXTURE)
    expect(byPlays[0].name).toBe('Alpha')
    expect(byPlays[0].plays).toBe(4)
    expect(byPlays[0].msPlayed).toBe(12 * MIN)

    const byTime = topArtists(FIXTURE, { sortBy: 'time' })
    expect(byTime[0].name).toBe('Alpha')
    expect(byTime[1].name).toBe('Beta')
    expect(byTime[1].msPlayed).toBe(7 * MIN)
  })

  it('keeps albums by different artists apart even with the same title', () => {
    const shared = [
      ...FIXTURE,
      p(2026, 5, 19, 9, 0, 'Delta', 'Six', 'Record A', 5),
      p(2026, 5, 19, 9, 6, 'Delta', 'Seven', 'Record A', 5),
      p(2026, 5, 19, 9, 12, 'Delta', 'Eight', 'Record A', 5),
      p(2026, 5, 19, 9, 18, 'Delta', 'Nine', 'Record A', 5),
      p(2026, 5, 19, 9, 24, 'Delta', 'Ten', 'Record A', 5),
    ]
    const albums = topAlbums(shared)
    const recordAs = albums.filter((a) => a.name === 'Record A')
    expect(recordAs).toHaveLength(2)
    expect(recordAs.map((a) => a.artistName).sort()).toEqual(['Alpha', 'Delta'])
  })

  it('counts totals, unique items and active days', () => {
    const t = totals(FIXTURE)
    expect(t.plays).toBe(7)
    expect(t.msPlayed).toBe(23 * MIN)
    expect(t.tracks).toBe(5)
    expect(t.artists).toBe(3)
    expect(t.albums).toBe(3)
    expect(t.activeDays).toBe(3)
    expect(t.skipped).toBe(1)
  })
})

describe('rhythms', () => {
  it('puts every play in its local hour', () => {
    const hours = byHour(FIXTURE)
    expect(hours).toHaveLength(24)
    // Three on the 15th, one on the 16th, one on the 18th.
    expect(hours[8].plays).toBe(5)
    expect(hours[21].plays).toBe(1)
    expect(hours[22].plays).toBe(1)
    expect(hours.reduce((s, h) => s + h.plays, 0)).toBe(7)
  })

  it('starts the week on Monday', () => {
    const days = byWeekday(FIXTURE)
    expect(days[0].label).toBe('Mon')
    expect(days.reduce((s, d) => s + d.plays, 0)).toBe(7)
  })

  it('builds a full seven by twenty-four clock', () => {
    const c = clock(FIXTURE)
    expect(c.cells).toHaveLength(168)
    // 15 June 2026 is a Monday, so the busiest single cell is Monday 8am with
    // three plays — the other four plays land in four different cells.
    expect(c.max).toBe(3)
  })

  it('includes days with no listening in the calendar', () => {
    const from = new Date(2026, 5, 15).getTime()
    const to = new Date(2026, 5, 19).getTime()
    const cal = calendar(FIXTURE, from, to)
    expect(cal.cells).toHaveLength(4)
    // The 17th is genuinely empty and must still appear.
    const seventeenth = cal.cells.find((c) => c.date.getDate() === 17)
    expect(seventeenth.plays).toBe(0)
  })
})

describe('sessions', () => {
  it('splits sittings on a gap of more than thirty minutes', () => {
    const sessions = buildSessions(FIXTURE)
    // Morning of the 15th, evening of the 15th, morning of the 16th,
    // night of the 16th, morning of the 18th.
    expect(sessions).toHaveLength(5)
    expect(sessions[0].plays).toBe(3)
  })

  it('reports the longest sitting by time actually listened', () => {
    const stats = sessionStats(buildSessions(FIXTURE))
    expect(stats.count).toBe(5)
    expect(stats.longest.msPlayed).toBe(9 * MIN)
  })

  it('breaks a listening streak on a missed day', () => {
    const streaks = listeningStreaks(FIXTURE)
    // 15th and 16th run together; the 17th is missing, so the 18th starts over.
    expect(streaks.longest).toBe(2)
    expect(streaks.current).toBe(1)
  })

  it('finds back to back repeats but ignores repeats spread across the day', () => {
    const repeat = longestRepeat(FIXTURE)
    expect(repeat.trackName).toBe('One')
    // Two consecutive at 08:00 and 08:04. The third play is the next day and
    // must not extend the run.
    expect(repeat.count).toBe(2)
  })

  it('finds the longest run of consecutive days for one artist', () => {
    const streak = longestArtistStreak(FIXTURE)
    expect(streak.artistName).toBe('Alpha')
    expect(streak.days).toBe(2)
  })
})

describe('behaviour', () => {
  it('measures skip rate and completion rate', () => {
    const h = habits(FIXTURE)
    expect(h.plays).toBe(7)
    expect(h.skipRate).toBeCloseTo(1 / 7)
    expect(h.completionRate).toBeCloseTo(6 / 7)
  })

  it('ignores artists below the minimum play count when ranking skips', () => {
    // Every artist here is well under the default minimum, so nothing qualifies.
    expect(skipByArtist(FIXTURE)).toHaveLength(0)
    // Lower the bar and Beta surfaces, at one skip in two plays.
    const loose = skipByArtist(FIXTURE, { minPlays: 2 })
    expect(loose[0].name).toBe('Beta')
    expect(loose[0].skipRate).toBeCloseTo(0.5)
  })

  it('counts tracks played exactly once', () => {
    const once = playedOnce(FIXTURE)
    // "One" was played three times; the other four tracks were played once.
    expect(once.count).toBe(4)
  })

  it('only calls an artist abandoned after a long silence', () => {
    expect(abandoned(FIXTURE)).toHaveLength(0)

    const longHistory = [
      ...Array.from({ length: 50 }, (_, i) => p(2023, 0, 1 + (i % 28), 10, i % 60, 'Ghost', `T${i}`, 'Old', 3)),
      p(2026, 5, 18, 8, 0, 'Gamma', 'Five', 'Record C', 4),
    ]
    const gone = abandoned(longHistory)
    expect(gone[0].name).toBe('Ghost')
    expect(gone[0].silentDays).toBeGreaterThan(180)
  })
})

describe('compare', () => {
  it('totals each year separately', () => {
    const spread = [
      p(2024, 2, 1, 10, 0, 'Alpha', 'One', 'Record A', 3),
      p(2025, 2, 1, 10, 0, 'Beta', 'Three', 'Record B', 3),
      p(2025, 2, 2, 10, 0, 'Beta', 'Three', 'Record B', 3),
    ]
    const years = byYear(spread)
    expect(years.map((y) => y.year)).toEqual([2024, 2025])
    expect(years[1].plays).toBe(2)
  })

  it('names the top artist of each year', () => {
    const spread = [
      p(2024, 2, 1, 10, 0, 'Alpha', 'One', 'Record A', 3),
      p(2025, 2, 1, 10, 0, 'Beta', 'Three', 'Record B', 3),
      p(2025, 2, 2, 10, 0, 'Beta', 'Three', 'Record B', 3),
    ]
    expect(artistOfEachYear(spread)).toEqual([
      { year: 2024, name: 'Alpha', plays: 1, msPlayed: 3 * MIN },
      { year: 2025, name: 'Beta', plays: 2, msPlayed: 6 * MIN },
    ])
  })

  it('separates climbers from new entries', () => {
    const previous = [
      p(2026, 4, 1, 10, 0, 'Alpha', 'One', 'Record A', 3),
      p(2026, 4, 1, 10, 5, 'Alpha', 'One', 'Record A', 3),
      p(2026, 4, 1, 10, 10, 'Beta', 'Three', 'Record B', 3),
    ]
    const current = [
      p(2026, 5, 1, 10, 0, 'Beta', 'Three', 'Record B', 3),
      p(2026, 5, 1, 10, 5, 'Beta', 'Three', 'Record B', 3),
      p(2026, 5, 1, 10, 10, 'Alpha', 'One', 'Record A', 3),
      p(2026, 5, 1, 10, 15, 'Zeta', 'New', 'Record Z', 3),
    ]
    const result = comparePeriods(current, previous)
    expect(result.climbers[0].name).toBe('Beta')
    expect(result.climbers[0].movement).toBe(1)
    expect(result.newEntries.map((n) => n.name)).toEqual(['Zeta'])
    expect(result.playsChange).toBeCloseTo(1 / 3)
  })

  it('reports no change rather than infinity when there is nothing to compare', () => {
    const result = comparePeriods(FIXTURE, [])
    expect(result.playsChange).toBeNull()
  })
})
