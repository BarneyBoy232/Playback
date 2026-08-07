// Comparison — the same question asked of different periods.
//
// This is where a permanent tracker beats an annual summary: not "who was your
// artist of the year", but "who has your artist of the year been, every year,
// and when did they take over".

import { tally, rank, topArtists } from './leaderboards.js'

/** Totals per calendar year, oldest first. */
export function byYear(plays) {
  const years = new Map()

  for (const play of plays) {
    const year = new Date(play.ts).getFullYear()
    if (!years.has(year)) {
      years.set(year, { year, plays: 0, msPlayed: 0, tracks: new Set(), artists: new Set() })
    }
    const row = years.get(year)
    row.plays++
    row.msPlayed += play.msPlayed
    row.tracks.add(play.trackUri)
    row.artists.add(play.artistName)
  }

  return [...years.values()]
    .sort((a, b) => a.year - b.year)
    .map((row) => ({
      year: row.year,
      plays: row.plays,
      msPlayed: row.msPlayed,
      tracks: row.tracks.size,
      artists: row.artists.size,
    }))
}

/** The number one artist of every year, and how many plays it took to win. */
export function artistOfEachYear(plays) {
  const byYearPlays = new Map()
  for (const play of plays) {
    const year = new Date(play.ts).getFullYear()
    if (!byYearPlays.has(year)) byYearPlays.set(year, [])
    byYearPlays.get(year).push(play)
  }

  return [...byYearPlays.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, yearPlays]) => {
      const top = topArtists(yearPlays, { limit: 1 })[0]
      return top ? { year, name: top.name, plays: top.plays, msPlayed: top.msPlayed } : { year, name: null }
    })
}

/**
 * One artist's rank in every year, so a rise or fall can be drawn as a line.
 * A year where they were never played comes back as null rather than a large
 * number, so the chart shows a genuine break instead of a plunge to the floor.
 */
export function artistRankByYear(plays, artistName, { depth = 200 } = {}) {
  const years = new Map()
  for (const play of plays) {
    const year = new Date(play.ts).getFullYear()
    if (!years.has(year)) years.set(year, [])
    years.get(year).push(play)
  }

  return [...years.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, yearPlays]) => {
      const table = topArtists(yearPlays, { limit: depth })
      const found = table.find((row) => row.name === artistName)
      return { year, rank: found ? found.rank : null, plays: found ? found.plays : 0 }
    })
}

/**
 * What was playing on this date in previous years.
 * @param {Date|number} date Any moment on the day of interest.
 */
export function onThisDay(plays, date) {
  const target = new Date(date)
  const month = target.getMonth()
  const day = target.getDate()
  const thisYear = target.getFullYear()

  const byYear = new Map()
  for (const play of plays) {
    const d = new Date(play.ts)
    if (d.getMonth() !== month || d.getDate() !== day) continue
    const year = d.getFullYear()
    if (year === thisYear) continue
    if (!byYear.has(year)) byYear.set(year, [])
    byYear.get(year).push(play)
  }

  return [...byYear.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, dayPlays]) => ({
      year,
      plays: dayPlays.length,
      msPlayed: dayPlays.reduce((sum, p) => sum + p.msPlayed, 0),
      topTracks: rank(
        tally(
          dayPlays,
          (p) => p.trackUri,
          (p) => ({ name: p.trackName, artistName: p.artistName }),
        ),
        { limit: 3 },
      ),
    }))
}

/**
 * Compare two sets of plays and report what moved.
 *
 * Used for "this period versus the one before": how the totals shifted, which
 * artists climbed, and which are new.
 */
export function comparePeriods(current, previous, { limit = 10 } = {}) {
  const currentTop = topArtists(current, { limit: 200 })
  const previousTop = topArtists(previous, { limit: 200 })
  const previousByName = new Map(previousTop.map((row) => [row.name, row]))

  const movers = currentTop.map((row) => {
    const before = previousByName.get(row.name)
    return {
      name: row.name,
      plays: row.plays,
      msPlayed: row.msPlayed,
      rank: row.rank,
      previousRank: before ? before.rank : null,
      // Positive means climbed. New entries have no movement, only a debut.
      movement: before ? before.rank - row.rank : null,
      isNew: !before,
    }
  })

  const currentMs = current.reduce((sum, p) => sum + p.msPlayed, 0)
  const previousMs = previous.reduce((sum, p) => sum + p.msPlayed, 0)

  return {
    playsChange: changeFraction(current.length, previous.length),
    timeChange: changeFraction(currentMs, previousMs),
    climbers: movers.filter((m) => m.movement > 0).sort((a, b) => b.movement - a.movement).slice(0, limit),
    fallers: movers.filter((m) => m.movement < 0).sort((a, b) => a.movement - b.movement).slice(0, limit),
    newEntries: movers.filter((m) => m.isNew).slice(0, limit),
  }
}

// Returns null rather than infinity when there is nothing to compare against,
// so the UI can say "no previous data" instead of "+∞%".
function changeFraction(now, before) {
  if (!before) return null
  return (now - before) / before
}
