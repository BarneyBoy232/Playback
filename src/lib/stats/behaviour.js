// Behaviour — how music was listened to, not just what.
//
// Skips, discovery, abandonment and devices all come from fields that only
// exist in the lifetime export. The Spotify API has never exposed any of it.

import { tally, rank, localDayKey } from './leaderboards.js'

/**
 * Overall skipping, plus how much listening was shuffled, offline or deliberate.
 *
 * Only plays from the lifetime export can answer any of this — the live API
 * reports none of it. Those live plays are marked `estimated` and left out of
 * the rates entirely, so a partly-live dataset reports an honest figure over
 * the plays it actually knows about instead of a diluted one over all of them.
 */
export function habits(plays) {
  const measured = plays.filter((p) => !p.estimated)

  if (!measured.length) {
    return { plays: plays.length, measuredPlays: 0, skipRate: null, shuffleRate: null, offlineRate: null, completionRate: null }
  }

  let skipped = 0
  let shuffled = 0
  let offline = 0
  let completed = 0

  for (const play of measured) {
    if (play.skipped) skipped++
    if (play.shuffle) shuffled++
    if (play.offline) offline++
    // 'trackdone' means it played through to the end rather than being cut off.
    if (play.reasonEnd === 'trackdone') completed++
  }

  return {
    plays: plays.length,
    measuredPlays: measured.length,
    skipRate: skipped / measured.length,
    shuffleRate: shuffled / measured.length,
    offlineRate: offline / measured.length,
    completionRate: completed / measured.length,
  }
}

/**
 * Skip rate per artist.
 *
 * A minimum play count is essential here — without it the leaderboard fills
 * with artists played twice and skipped both times, which is noise rather than
 * a finding.
 */
export function skipByArtist(plays, { minPlays = 20, limit = 25, mostSkipped = true } = {}) {
  // Same reasoning as habits(): live-API plays know nothing about skipping and
  // would only water the figures down.
  const map = tally(
    plays.filter((p) => !p.estimated),
    (p) => p.artistName,
    (p) => ({ name: p.artistName }),
  )

  const rows = [...map.values()]
    .filter((row) => row.plays >= minPlays)
    .map((row) => ({ ...row, skipRate: row.skipped / row.plays }))
    .sort((a, b) => (mostSkipped ? b.skipRate - a.skipRate : a.skipRate - b.skipRate))

  return rows.slice(0, limit).map((row, i) => ({ ...row, rank: i + 1 }))
}

/** Device and country breakdowns, largest first. */
export function breakdowns(plays) {
  return {
    platform: rank(tally(plays, (p) => p.platform || 'unknown', (p) => ({ name: p.platform || 'unknown' })), { limit: 0 }),
    country: rank(tally(plays, (p) => p.country || 'unknown', (p) => ({ name: p.country || 'unknown' })), { limit: 0 }),
  }
}

/**
 * When each artist and track was heard for the first time.
 *
 * Note this is first-play WITHIN THE DATA GIVEN. Over a full lifetime export
 * that is genuinely the first time; over a narrow window it means "first time
 * in this period", which is still useful but means something different.
 */
export function firstHeard(plays) {
  const artists = new Map()
  const tracks = new Map()

  for (const play of plays) {
    const a = artists.get(play.artistName)
    if (!a || play.ts < a.ts) artists.set(play.artistName, { ts: play.ts, name: play.artistName })

    const t = tracks.get(play.trackUri)
    if (!t || play.ts < t.ts) {
      tracks.set(play.trackUri, { ts: play.ts, name: play.trackName, artistName: play.artistName, uri: play.trackUri })
    }
  }

  return { artists, tracks }
}

/** How many artists were discovered each month — the appetite-for-new-music chart. */
export function discoveryByMonth(plays) {
  const { artists } = firstHeard(plays)
  const months = new Map()

  for (const artist of artists.values()) {
    const d = new Date(artist.ts)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (!months.has(key)) months.set(key, { key, ts: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), newArtists: 0 })
    months.get(key).newArtists++
  }

  return [...months.values()].sort((a, b) => a.ts - b.ts)
}

/**
 * Artists that were heavily played and then stopped completely.
 *
 * The test is deliberately strict: they must clear a real play count, and then
 * have been silent for a long stretch running right up to the end of the data.
 * Anything looser surfaces artists who were simply not played this month.
 */
export function abandoned(plays, { minPlays = 40, silentDays = 180, limit = 20 } = {}) {
  if (!plays.length) return []

  const latest = plays.reduce((max, p) => (p.ts > max ? p.ts : max), plays[0].ts)
  const cutoffMs = silentDays * 86400000

  const map = tally(
    plays,
    (p) => p.artistName,
    (p) => ({ name: p.artistName }),
  )

  return [...map.values()]
    .filter((row) => row.plays >= minPlays && latest - row.lastTs >= cutoffMs)
    .map((row) => ({ ...row, silentDays: Math.floor((latest - row.lastTs) / 86400000) }))
    .sort((a, b) => b.plays - a.plays)
    .slice(0, limit)
}

/**
 * Tracks played exactly once and never returned to.
 * The counterpart to the top-songs list, and usually a much longer one.
 */
export function playedOnce(plays, { limit = 50 } = {}) {
  const map = tally(
    plays,
    (p) => p.trackUri,
    (p) => ({ name: p.trackName, artistName: p.artistName, albumName: p.albumName }),
  )

  const rows = [...map.values()].filter((row) => row.plays === 1)
  return {
    count: rows.length,
    share: map.size ? rows.length / map.size : 0,
    sample: rows.sort((a, b) => b.ts - a.ts).slice(0, limit),
  }
}

/**
 * Tracks that only ever get played at a particular time of day.
 * Finds the songs someone only listens to late at night, or only on the commute.
 */
export function timeLockedTracks(plays, { minPlays = 8, spreadHours = 4, limit = 20 } = {}) {
  const byTrack = new Map()

  for (const play of plays) {
    let row = byTrack.get(play.trackUri)
    if (!row) {
      row = { uri: play.trackUri, name: play.trackName, artistName: play.artistName, hours: [], plays: 0 }
      byTrack.set(play.trackUri, row)
    }
    row.hours.push(new Date(play.ts).getHours())
    row.plays++
  }

  const results = []
  for (const row of byTrack.values()) {
    if (row.plays < minPlays) continue
    const min = Math.min(...row.hours)
    const max = Math.max(...row.hours)
    const spread = max - min
    if (spread <= spreadHours) {
      results.push({ ...row, fromHour: min, toHour: max, spread, hours: undefined })
    }
  }

  return results.sort((a, b) => b.plays - a.plays).slice(0, limit)
}

/** Days where listening was unusually heavy compared to the personal average. */
export function bingeDays(plays, { multiplier = 3, limit = 15 } = {}) {
  if (!plays.length) return []

  const days = new Map()
  for (const play of plays) {
    const key = localDayKey(play.ts)
    if (!days.has(key)) days.set(key, { key, ts: play.ts, plays: 0, msPlayed: 0 })
    const day = days.get(key)
    day.plays++
    day.msPlayed += play.msPlayed
    if (play.ts < day.ts) day.ts = play.ts
  }

  const rows = [...days.values()]
  const average = rows.reduce((sum, d) => sum + d.msPlayed, 0) / rows.length

  return rows
    .filter((d) => d.msPlayed >= average * multiplier)
    .sort((a, b) => b.msPlayed - a.msPlayed)
    .slice(0, limit)
    .map((d) => ({ ...d, timesAverage: d.msPlayed / average }))
}
