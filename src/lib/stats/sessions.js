// Sessions, streaks and repeats — the shape of listening rather than its
// contents.
//
// None of this is available from the Spotify API at any price. It only exists
// because the lifetime export records every individual play with a timestamp.

import { localDayKey } from './leaderboards.js'

/** Two plays more than this far apart are treated as separate sittings. */
export const SESSION_GAP_MS = 30 * 60 * 1000

/**
 * Group plays into listening sessions.
 *
 * A session ends when there is a gap of more than 30 minutes. That threshold is
 * a judgement call: long enough that a pause to make coffee does not split a
 * session in two, short enough that this morning and this evening do not merge
 * into one.
 */
export function buildSessions(plays, gapMs = SESSION_GAP_MS) {
  if (!plays.length) return []

  const ordered = [...plays].sort((a, b) => a.ts - b.ts)
  const sessions = []
  let current = null

  for (const play of ordered) {
    if (!current || play.ts - current.lastTs > gapMs) {
      current = {
        start: play.ts,
        end: play.ts + play.msPlayed,
        lastTs: play.ts,
        plays: 0,
        msPlayed: 0,
        tracks: new Set(),
        artists: new Set(),
      }
      sessions.push(current)
    }

    current.plays++
    current.msPlayed += play.msPlayed
    current.tracks.add(play.trackUri)
    current.artists.add(play.artistName)
    current.lastTs = play.ts
    current.end = play.ts + play.msPlayed
  }

  return sessions.map((s) => ({
    start: s.start,
    end: s.end,
    // Wall-clock length, which includes the small gaps between tracks. Time
    // actually listened is msPlayed and is usually a little lower.
    durationMs: s.end - s.start,
    plays: s.plays,
    msPlayed: s.msPlayed,
    uniqueTracks: s.tracks.size,
    uniqueArtists: s.artists.size,
  }))
}

export function sessionStats(sessions) {
  if (!sessions.length) return { count: 0, longest: null, averageMs: 0, averagePlays: 0 }

  let longest = sessions[0]
  let totalMs = 0
  let totalPlays = 0

  for (const session of sessions) {
    if (session.msPlayed > longest.msPlayed) longest = session
    totalMs += session.msPlayed
    totalPlays += session.plays
  }

  return {
    count: sessions.length,
    longest,
    averageMs: totalMs / sessions.length,
    averagePlays: totalPlays / sessions.length,
  }
}

/**
 * Consecutive days with at least one play.
 *
 * Returns the longest run ever, and the run that is still going as of the last
 * play in the data.
 */
export function listeningStreaks(plays) {
  if (!plays.length) return { longest: 0, longestStart: null, longestEnd: null, current: 0 }

  const days = [...new Set(plays.map((p) => localDayKey(p.ts)))]
    .map((key) => {
      const [y, m, d] = key.split('-').map(Number)
      return new Date(y, m, d).getTime()
    })
    .sort((a, b) => a - b)

  let longest = 1
  let longestStart = days[0]
  let longestEnd = days[0]
  let run = 1
  let runStart = days[0]

  for (let i = 1; i < days.length; i++) {
    if (isNextDay(days[i - 1], days[i])) {
      run++
    } else {
      run = 1
      runStart = days[i]
    }
    if (run > longest) {
      longest = run
      longestStart = runStart
      longestEnd = days[i]
    }
  }

  // The run still alive at the end of the data.
  let current = 1
  for (let i = days.length - 1; i > 0; i--) {
    if (isNextDay(days[i - 1], days[i])) current++
    else break
  }

  return { longest, longestStart, longestEnd, current }
}

/**
 * The longest run of the same track played back to back.
 * This is the "I put this on repeat for an hour" statistic.
 */
export function longestRepeat(plays) {
  if (!plays.length) return null

  const ordered = [...plays].sort((a, b) => a.ts - b.ts)
  let best = { count: 0 }
  let run = 0
  let runStart = null

  for (let i = 0; i < ordered.length; i++) {
    const play = ordered[i]
    const previous = ordered[i - 1]

    // A run only counts if the repeats were actually consecutive in time —
    // playing a song, listening to an album, then playing it again is not a run.
    const continues = previous && previous.trackUri === play.trackUri && play.ts - previous.ts < SESSION_GAP_MS

    if (continues) {
      run++
    } else {
      run = 1
      runStart = play.ts
    }

    if (run > best.count) {
      best = {
        count: run,
        trackUri: play.trackUri,
        trackName: play.trackName,
        artistName: play.artistName,
        start: runStart,
        end: play.ts,
      }
    }
  }

  return best.count > 1 ? best : null
}

/**
 * The longest run of consecutive days where one artist appeared at least once.
 * This is how a fortnight-long obsession shows up in the data.
 */
export function longestArtistStreak(plays, { minDays = 2 } = {}) {
  if (!plays.length) return null

  // Artist to the set of local days they were played on.
  const daysByArtist = new Map()
  for (const play of plays) {
    let set = daysByArtist.get(play.artistName)
    if (!set) {
      set = new Set()
      daysByArtist.set(play.artistName, set)
    }
    set.add(localDayKey(play.ts))
  }

  let best = null
  for (const [artistName, daySet] of daysByArtist) {
    const days = [...daySet]
      .map((key) => {
        const [y, m, d] = key.split('-').map(Number)
        return new Date(y, m, d).getTime()
      })
      .sort((a, b) => a - b)

    let run = 1
    let runStart = days[0]
    for (let i = 1; i < days.length; i++) {
      if (isNextDay(days[i - 1], days[i])) {
        run++
      } else {
        run = 1
        runStart = days[i]
      }
      if (!best || run > best.days) {
        best = { artistName, days: run, start: runStart, end: days[i] }
      }
    }
  }

  return best && best.days >= minDays ? best : null
}

// Calendar-aware rather than a fixed 24 hour offset, so daylight saving does
// not break a streak.
function isNextDay(earlier, later) {
  const d = new Date(earlier)
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime()
  return next === later
}
