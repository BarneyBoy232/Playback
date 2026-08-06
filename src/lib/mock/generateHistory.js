// Generates a fake "Extended Streaming History" — the same file format Spotify
// hands over when you request your data.
//
// The important design decision: this generator emits the RAW Spotify export
// shape, not our internal shape. That means the real import parser
// (src/lib/import/parseExport.js) processes mock data too, so the parser is
// exercised on every single run instead of being tested once at the end.
//
// The other important decision: the fake data has real structure. Listening
// peaks in the morning and evening, drops midweek, artists rise and fade with
// the seasons, a few artists get obsessed over for a fortnight and then
// dropped, and some are abandoned entirely after the first year. Statistics
// built on flat random noise look correct while proving nothing — this data
// exists so trends, streaks and abandonment detection can actually be verified.

import { makeRng, randInt, pick, weightedIndex } from './rng.js'
import { buildCatalogue } from './catalogue.js'

const DAY_MS = 86400000

// How likely a listening session is to START in each hour of the day.
// Index 0 = midnight. Peaks at the morning commute and again through the evening.
const HOUR_WEIGHTS = [
  0.3, 0.15, 0.08, 0.05, 0.05, 0.2, 0.8, 2.4,
  3.6, 2.2, 1.6, 1.5, 1.8, 1.7, 1.6, 1.9,
  2.6, 3.8, 3.4, 3.0, 2.8, 2.4, 1.5, 0.7,
]

// Multiplier on how much listening happens, by day of week (0 = Sunday).
const DAY_OF_WEEK_WEIGHTS = [0.85, 1.15, 1.1, 1.05, 1.05, 1.2, 0.95]

const PLATFORMS = ['android', 'windows', 'ios', 'web_player', 'cast_to_device']
const PLATFORM_WEIGHTS = [46, 28, 14, 8, 4]

const PODCAST_SHOWS = [
  { show: 'The Rest Is History', episodes: ['The Siege of Malta', 'Byzantium Falls', 'Rome Burns'] },
  { show: 'Search Engine', episodes: ['Why is my rent so high', 'Who killed the video store'] },
  { show: 'Darknet Diaries', episodes: ['The Beirut Bank Job', 'Operation Glowing Symphony'] },
]

/**
 * Generate a fake lifetime of listening.
 *
 * @param {object} opts
 * @param {number} opts.seed       Same seed = identical output, always.
 * @param {number} opts.years      How many years of history to produce.
 * @param {string} opts.endDate    Last day of history, as YYYY-MM-DD.
 * @param {number} opts.artistCount How large the fake music world is.
 * @returns {{entries: Array, groundTruth: object, catalogue: object}}
 */
export function generateHistory({
  seed = 20260806,
  years = 4,
  endDate = '2026-08-06',
  artistCount = 800,
} = {}) {
  const rng = makeRng(seed)
  const catalogue = buildCatalogue({ seed: seed + 1, artistCount })
  const { artists } = catalogue

  const end = Date.parse(`${endDate}T00:00:00Z`)
  const totalDays = Math.round(years * 365)
  const start = end - totalDays * DAY_MS

  // ---------------------------------------------------------------------
  // Decide, up front, the shape of this person's taste over time.
  // These are the facts the statistics engine should later be able to
  // rediscover on its own — which is exactly what the tests check.
  // ---------------------------------------------------------------------

  // Tier 1: the ~40 artists they always come back to.
  const coreCount = Math.min(40, Math.floor(artistCount * 0.05))
  // Tier 2: a wider set they listen to regularly but not obsessively.
  const regularCount = Math.min(200, Math.floor(artistCount * 0.25))

  const baseWeights = new Array(artists.length)
  for (let i = 0; i < artists.length; i++) {
    if (i < coreCount) baseWeights[i] = 12
    else if (i < regularCount) baseWeights[i] = 3
    else baseWeights[i] = 0.4
  }

  // Artists that were heavy early on and then dropped completely.
  const abandonedCutoffDay = Math.floor(totalDays * 0.28)
  const abandonedIdx = []
  while (abandonedIdx.length < 15) {
    const i = randInt(rng, coreCount, regularCount - 1)
    if (!abandonedIdx.includes(i)) abandonedIdx.push(i)
  }

  // One artist per season gets a large, temporary boost.
  const seasonLengthDays = 91
  const seasonalPhases = []
  for (let d = 0; d < totalDays; d += seasonLengthDays) {
    seasonalPhases.push({
      artistIdx: randInt(rng, 0, regularCount - 1),
      startDay: d,
      endDay: Math.min(d + seasonLengthDays, totalDays),
    })
  }

  // Short, intense obsessions: two or three weeks of one artist on repeat.
  const bursts = []
  for (let b = 0; b < 12; b++) {
    const startDay = randInt(rng, 0, totalDays - 25)
    bursts.push({
      artistIdx: randInt(rng, 0, regularCount - 1),
      startDay,
      endDay: startDay + randInt(rng, 14, 21),
    })
  }

  // A single stretch of travel, so the country breakdown has something in it.
  const travelStartDay = randInt(rng, Math.floor(totalDays * 0.4), Math.floor(totalDays * 0.8))
  const travelEndDay = travelStartDay + 21

  // ---------------------------------------------------------------------
  // Walk the timeline day by day and actually play music.
  // ---------------------------------------------------------------------

  const entries = []
  const dayWeights = new Array(artists.length)

  for (let day = 0; day < totalDays; day++) {
    const dayStart = start + day * DAY_MS
    const dow = new Date(dayStart).getUTCDay()

    // Rebuild today's artist weights from the base plus whatever phases are active.
    for (let i = 0; i < artists.length; i++) dayWeights[i] = baseWeights[i]
    for (const i of abandonedIdx) {
      dayWeights[i] = day < abandonedCutoffDay ? 22 : 0
    }
    for (const phase of seasonalPhases) {
      if (day >= phase.startDay && day < phase.endDay) dayWeights[phase.artistIdx] += 38
    }
    for (const burst of bursts) {
      if (day >= burst.startDay && day < burst.endDay) dayWeights[burst.artistIdx] += 120
    }

    // Some days there is simply no listening at all.
    if (rng() < 0.04) continue

    const sessionCount = Math.max(
      1,
      Math.round(randInt(rng, 1, 5) * DAY_OF_WEEK_WEIGHTS[dow] * (0.7 + rng() * 0.7)),
    )

    const country = day >= travelStartDay && day < travelEndDay ? 'JP' : 'AU'

    for (let s = 0; s < sessionCount; s++) {
      const hour = weightedIndex(rng, HOUR_WEIGHTS)
      let cursor = dayStart + hour * 3600000 + randInt(rng, 0, 59) * 60000

      const platform = PLATFORMS[weightedIndex(rng, PLATFORM_WEIGHTS)]
      const offline = rng() < 0.06
      const shuffle = rng() < 0.45
      // Short sessions are far more common than marathon ones.
      const sessionTracks = rng() < 0.6 ? randInt(rng, 3, 12) : randInt(rng, 12, 32)

      let artistIdx = weightedIndex(rng, dayWeights)
      let artist = artists[artistIdx]
      // Sitting with one album start-to-finish vs jumping around.
      let albumMode = !shuffle && rng() < 0.65
      let album = albumMode ? pick(rng, artist.albums) : null
      let albumPos = 0

      for (let t = 0; t < sessionTracks; t++) {
        // Mixed sessions drift to another artist every so often.
        if (!albumMode && rng() < 0.25) {
          artistIdx = weightedIndex(rng, dayWeights)
          artist = artists[artistIdx]
        }
        if (!artist || artist.tracks.length === 0) break

        let track
        if (albumMode && album) {
          const uri = album.trackUris[albumPos % album.trackUris.length]
          track = catalogue.tracksByUri.get(uri)
          albumPos++
          if (albumPos >= album.trackUris.length) {
            // Album finished — either put on another of theirs or drift away.
            album = pick(rng, artist.albums)
            albumPos = 0
          }
        } else {
          track = pick(rng, artist.tracks)
        }

        // Occasionally a song gets hammered on repeat.
        const repeats = rng() < 0.04 ? randInt(rng, 2, 5) : 1

        for (let r = 0; r < repeats; r++) {
          // Tail artists get skipped more — that is what makes skip-rate-by-artist meaningful.
          const skipChance = artistIdx < coreCount ? 0.09 : artistIdx < regularCount ? 0.17 : 0.34
          const skipped = rng() < skipChance
          const isFirstOfSession = t === 0 && r === 0

          let msPlayed
          let reasonEnd
          if (skipped) {
            msPlayed = randInt(rng, 1500, 29000)
            reasonEnd = 'fwdbtn'
          } else if (rng() < 0.05) {
            // Walked away mid-song.
            msPlayed = Math.floor(track.durationMs * (0.4 + rng() * 0.4))
            reasonEnd = 'endplay'
          } else {
            msPlayed = track.durationMs - randInt(rng, 0, 1200)
            reasonEnd = 'trackdone'
          }

          const reasonStart = isFirstOfSession
            ? pick(rng, ['clickrow', 'playbtn', 'appload'])
            : r > 0
              ? 'trackdone'
              : shuffle
                ? 'trackdone'
                : 'trackdone'

          entries.push({
            ts: new Date(cursor).toISOString().replace('.000Z', 'Z'),
            platform,
            ms_played: msPlayed,
            conn_country: country,
            master_metadata_track_name: track.name,
            master_metadata_album_artist_name: track.artistName,
            master_metadata_album_album_name: track.albumName,
            spotify_track_uri: track.uri,
            episode_name: null,
            episode_show_name: null,
            spotify_episode_uri: null,
            reason_start: reasonStart,
            reason_end: reasonEnd,
            shuffle,
            skipped,
            offline,
            offline_timestamp: offline ? Math.floor(cursor / 1000) : null,
            incognito_mode: false,
          })

          // Next track starts when this one stopped, plus a beat.
          cursor += msPlayed + randInt(rng, 200, 2500)
        }
      }
    }
  }

  // A few hundred podcast plays, so the import filter has something real to strip out.
  const podcastCount = 300
  for (let p = 0; p < podcastCount; p++) {
    const day = randInt(rng, 0, totalDays - 1)
    const show = pick(rng, PODCAST_SHOWS)
    const cursor = start + day * DAY_MS + randInt(rng, 6, 22) * 3600000
    entries.push({
      ts: new Date(cursor).toISOString().replace('.000Z', 'Z'),
      platform: pick(rng, PLATFORMS),
      ms_played: randInt(rng, 60000, 3600000),
      conn_country: 'AU',
      master_metadata_track_name: null,
      master_metadata_album_artist_name: null,
      master_metadata_album_album_name: null,
      spotify_track_uri: null,
      episode_name: pick(rng, show.episodes),
      episode_show_name: show.show,
      spotify_episode_uri: `spotify:episode:${p}aaaaaaaaaaaaaaaaaaaa`,
      reason_start: 'clickrow',
      reason_end: 'endplay',
      shuffle: false,
      skipped: false,
      offline: false,
      offline_timestamp: null,
      incognito_mode: false,
    })
  }

  // Spotify's real exports are ordered by time, so match that.
  entries.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0))

  return {
    entries,
    catalogue,
    groundTruth: buildGroundTruth(entries, {
      artists,
      abandonedIdx,
      seasonalPhases,
      bursts,
      start,
      podcastCount,
      travelStartDay,
      travelEndDay,
    }),
  }
}

// Works out what is actually true about the data we just produced, plus records
// the patterns we deliberately injected. Tests assert that the statistics
// engine independently arrives at these same answers.
function buildGroundTruth(entries, ctx) {
  const music = entries.filter((e) => e.master_metadata_track_name !== null)

  const trackCounts = new Map()
  const artistCounts = new Map()
  const artistMs = new Map()
  let totalMs = 0

  for (const e of music) {
    totalMs += e.ms_played
    trackCounts.set(e.spotify_track_uri, (trackCounts.get(e.spotify_track_uri) || 0) + 1)
    const a = e.master_metadata_album_artist_name
    artistCounts.set(a, (artistCounts.get(a) || 0) + 1)
    artistMs.set(a, (artistMs.get(a) || 0) + e.ms_played)
  }

  const topTrackUri = [...trackCounts.entries()].sort((x, y) => y[1] - x[1])[0]
  const topArtist = [...artistCounts.entries()].sort((x, y) => y[1] - x[1])[0]
  const topArtistByMs = [...artistMs.entries()].sort((x, y) => y[1] - x[1])[0]
  const topTrackEntry = music.find((e) => e.spotify_track_uri === topTrackUri[0])

  return {
    totalEntries: entries.length,
    musicPlays: music.length,
    podcastPlays: ctx.podcastCount,
    totalMsPlayed: totalMs,
    uniqueTracks: trackCounts.size,
    uniqueArtists: artistCounts.size,
    firstTs: music[0].ts,
    lastTs: music[music.length - 1].ts,
    topTrack: { uri: topTrackUri[0], name: topTrackEntry.master_metadata_track_name, plays: topTrackUri[1] },
    topArtistByPlays: { name: topArtist[0], plays: topArtist[1] },
    topArtistByTime: { name: topArtistByMs[0], msPlayed: topArtistByMs[1] },
    // The patterns we planted on purpose.
    abandonedArtists: ctx.abandonedIdx.map((i) => ctx.artists[i].name),
    seasonalArtists: ctx.seasonalPhases.map((p) => ({
      name: ctx.artists[p.artistIdx].name,
      startTs: new Date(ctx.start + p.startDay * 86400000).toISOString(),
      endTs: new Date(ctx.start + p.endDay * 86400000).toISOString(),
    })),
    burstArtists: ctx.bursts.map((b) => ({
      name: ctx.artists[b.artistIdx].name,
      startTs: new Date(ctx.start + b.startDay * 86400000).toISOString(),
      endTs: new Date(ctx.start + b.endDay * 86400000).toISOString(),
    })),
    travelCountry: 'JP',
  }
}
