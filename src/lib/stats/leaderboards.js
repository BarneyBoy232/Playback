// Leaderboards — the "most played" half of the app.
//
// Everything here counts two ways at once: by number of plays, and by time
// listened. They disagree more often than you would expect. A three minute pop
// song played 200 times beats a twelve minute epic played 60 times on play
// count, and loses badly on time. Both answers are true, so both are kept and
// the caller decides which to show.

/**
 * Group plays by some key, counting plays and time and remembering when the
 * first and last one happened.
 *
 * @param {Array} plays
 * @param {Function} keyFn   Returns the grouping key, or null to skip the play.
 * @param {Function} metaFn  Returns extra fields to store on the row.
 * @returns {Map<string, object>}
 */
export function tally(plays, keyFn, metaFn = () => ({})) {
  const map = new Map()
  for (const play of plays) {
    const key = keyFn(play)
    if (!key) continue

    let row = map.get(key)
    if (!row) {
      row = { key, plays: 0, msPlayed: 0, skipped: 0, firstTs: play.ts, lastTs: play.ts, ...metaFn(play) }
      map.set(key, row)
    }

    row.plays++
    row.msPlayed += play.msPlayed
    if (play.skipped) row.skipped++
    if (play.ts < row.firstTs) row.firstTs = play.ts
    if (play.ts > row.lastTs) row.lastTs = play.ts
  }
  return map
}

/** Sort a tally and cut it to size. `sortBy` is 'plays' or 'time'. */
export function rank(map, { sortBy = 'plays', limit = 50 } = {}) {
  const field = sortBy === 'time' ? 'msPlayed' : 'plays'
  const rows = [...map.values()].sort((a, b) => {
    if (b[field] !== a[field]) return b[field] - a[field]
    // Ties break on the other measure, then alphabetically, so the order is
    // stable rather than dependent on insertion order.
    const other = field === 'plays' ? 'msPlayed' : 'plays'
    if (b[other] !== a[other]) return b[other] - a[other]
    return String(a.name || a.key).localeCompare(String(b.name || b.key))
  })
  const sliced = limit > 0 ? rows.slice(0, limit) : rows
  return sliced.map((row, i) => ({ ...row, rank: i + 1 }))
}

export function topTracks(plays, opts = {}) {
  return rank(
    tally(
      plays,
      (p) => p.trackUri,
      (p) => ({ name: p.trackName, artistName: p.artistName, albumName: p.albumName }),
    ),
    opts,
  )
}

export function topArtists(plays, opts = {}) {
  return rank(
    tally(
      plays,
      (p) => p.artistName,
      (p) => ({ name: p.artistName }),
    ),
    opts,
  )
}

export function topAlbums(plays, opts = {}) {
  return rank(
    tally(
      plays,
      // Album titles are not unique across artists — "Greatest Hits" exists a
      // hundred times over — so the artist is part of the key.
      (p) => `${p.artistName}::${p.albumName}`,
      (p) => ({ name: p.albumName, artistName: p.artistName }),
    ),
    opts,
  )
}

/**
 * Genres come from artist metadata, which the app can only collect from
 * whatever the Spotify API happens to return. Artists with no genre data are
 * skipped rather than lumped into an "unknown" bucket, which would dominate the
 * chart and say nothing.
 *
 * @param {Map<string, string[]>} genresByArtist Artist name to genre list.
 */
export function topGenres(plays, genresByArtist, opts = {}) {
  if (!genresByArtist || genresByArtist.size === 0) return []

  const map = new Map()
  for (const play of plays) {
    const genres = genresByArtist.get(play.artistName)
    if (!genres || !genres.length) continue

    // A play by a three-genre artist counts once towards each of the three.
    for (const genre of genres) {
      let row = map.get(genre)
      if (!row) {
        row = { key: genre, name: genre, plays: 0, msPlayed: 0, skipped: 0, artists: new Set(), firstTs: play.ts, lastTs: play.ts }
        map.set(genre, row)
      }
      row.plays++
      row.msPlayed += play.msPlayed
      row.artists.add(play.artistName)
      if (play.ts < row.firstTs) row.firstTs = play.ts
      if (play.ts > row.lastTs) row.lastTs = play.ts
    }
  }

  return rank(map, opts).map((row) => ({ ...row, artistCount: row.artists.size, artists: undefined }))
}

/** The headline numbers for a window. */
export function totals(plays) {
  if (!plays.length) {
    return { plays: 0, msPlayed: 0, tracks: 0, artists: 0, albums: 0, activeDays: 0, skipped: 0, skipRate: 0, playsPerActiveDay: 0 }
  }

  const tracks = new Set()
  const artists = new Set()
  const albums = new Set()
  const days = new Set()
  let msPlayed = 0
  let skipped = 0
  let measured = 0

  for (const play of plays) {
    tracks.add(play.trackUri)
    artists.add(play.artistName)
    albums.add(`${play.artistName}::${play.albumName}`)
    days.add(localDayKey(play.ts))
    msPlayed += play.msPlayed
    // Plays recovered from the live API carry no skip information, so they are
    // excluded from the skip rate rather than silently counted as "not skipped",
    // which would drag the figure towards zero.
    if (!play.estimated) {
      measured++
      if (play.skipped) skipped++
    }
  }

  return {
    plays: plays.length,
    msPlayed,
    tracks: tracks.size,
    artists: artists.size,
    albums: albums.size,
    activeDays: days.size,
    skipped,
    measuredPlays: measured,
    skipRate: measured ? skipped / measured : 0,
    // Deliberately per ACTIVE day rather than per calendar day: on the days he
    // actually listened, this is how much he listened.
    playsPerActiveDay: plays.length / days.size,
  }
}

/** 'YYYY-M-D' on the listener's own clock. Used wherever days are grouped. */
export function localDayKey(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}
