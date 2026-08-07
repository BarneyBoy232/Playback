// Pulling data out of Spotify and into the local database.
//
// An important honesty note runs through this file. Plays recovered from the
// live API are NOT as good as plays from the lifetime export:
//
//   - The API never says how long a track was actually listened to, only that
//     it was played for at least 30 seconds. Its full duration is recorded as
//     an estimate.
//   - It never says whether a track was skipped, or why playback stopped.
//   - It never says which device was used, or whether it was offline.
//
// So every live play is tagged `estimated: true`, and the statistics that would
// be distorted by guesswork — skip rate above all — deliberately ignore them.
// Silently mixing guessed data into measured data would quietly corrupt the
// numbers this whole app exists to produce.

import { db, addPlays, getMeta, setMeta } from '../db.js'

/** Turn a recently-played response into play records. */
export function recentlyPlayedToPlays(response) {
  if (!response || !response.items) return []

  return response.items
    .map((item) => {
      const track = item.track
      if (!track || !track.uri) return null

      const ts = Date.parse(item.played_at)
      if (Number.isNaN(ts)) return null

      return {
        key: `${ts}|${track.uri}`,
        ts,
        // The API does not report listening time. Full duration is the closest
        // available answer, and the estimated flag records that it is a guess.
        msPlayed: track.duration_ms || 0,
        trackUri: track.uri,
        trackName: track.name,
        artistName: track.artists?.[0]?.name || 'Unknown Artist',
        albumName: track.album?.name || 'Unknown Album',
        reasonStart: null,
        reasonEnd: null,
        shuffle: false,
        skipped: false,
        offline: false,
        platform: 'unknown',
        country: null,
        source: 'live',
        estimated: true,
      }
    })
    .filter(Boolean)
}

/**
 * Fetch anything played since the last sync and store it.
 *
 * The API only ever returns the last 50 plays, so a gap longer than 50 tracks
 * is genuinely lost — which is why continuous polling matters, and why the
 * lifetime export remains the real backbone.
 */
export async function syncRecentPlays(api) {
  const lastSeen = await getMeta('lastLivePlayTs', null)
  const response = await api.getRecentlyPlayed(lastSeen)
  const plays = recentlyPlayedToPlays(response)

  if (!plays.length) {
    await setMeta('lastSync', { at: Date.now(), added: 0 })
    return { added: 0, fetched: 0 }
  }

  const { added } = await addPlays(plays)
  const newest = plays.reduce((max, p) => (p.ts > max ? p.ts : max), 0)

  await setMeta('lastLivePlayTs', newest)
  await setMeta('lastSync', { at: Date.now(), added })

  return { added, fetched: plays.length }
}

/**
 * Collect artist and album metadata from responses we are fetching anyway.
 *
 * This exists because bulk metadata lookup was removed from Development Mode in
 * February 2026. Whatever passes through here gets cached, so the picture fills
 * in gradually as the app is used rather than arriving all at once.
 */
export async function harvestMetadata(api) {
  const artists = new Map()
  const albums = new Map()

  const ranges = ['short_term', 'medium_term', 'long_term']

  for (const range of ranges) {
    const [topArtists, topTracks] = await Promise.all([
      api.getTopArtists(range, 50),
      api.getTopTracks(range, 50),
    ])

    for (const artist of topArtists.items || []) {
      artists.set(artist.id, {
        id: artist.id,
        name: artist.name,
        genres: artist.genres || [],
        images: artist.images || [],
      })
    }

    for (const track of topTracks.items || []) {
      if (track.album) {
        albums.set(track.album.id, {
          id: track.album.id,
          name: track.album.name,
          releaseDate: track.album.release_date || null,
          images: track.album.images || [],
        })
      }
    }

    // Keep Spotify's own rankings so ours can be compared against them.
    await db.snapshots.add({
      capturedAt: Date.now(),
      type: 'artists',
      range,
      items: (topArtists.items || []).map((a) => a.name),
    })
    await db.snapshots.add({
      capturedAt: Date.now(),
      type: 'tracks',
      range,
      items: (topTracks.items || []).map((t) => ({ name: t.name, artist: t.artists?.[0]?.name })),
    })
  }

  // Followed artists are another free source of genre and artwork data.
  const followed = await api.getFollowedArtists()
  for (const artist of followed.items || []) {
    if (!artists.has(artist.id)) {
      artists.set(artist.id, {
        id: artist.id,
        name: artist.name,
        genres: artist.genres || [],
        images: artist.images || [],
      })
    }
  }

  if (artists.size) await db.artists.bulkPut([...artists.values()])
  if (albums.size) await db.albums.bulkPut([...albums.values()])

  return { artists: artists.size, albums: albums.size }
}

/** Artist name to genre list, for the genre leaderboard. */
export async function genresByArtist() {
  const rows = await db.artists.toArray()
  const map = new Map()
  for (const row of rows) {
    if (row.genres && row.genres.length) map.set(row.name, row.genres)
  }
  return map
}

/** Everything a first connection should pull. */
export async function fullSync(api, onProgress = () => {}) {
  onProgress('Reading your profile')
  const profile = await api.getProfile()

  onProgress('Collecting artist and album details')
  const harvested = await harvestMetadata(api)

  onProgress('Fetching recent plays')
  const recent = await syncRecentPlays(api)

  await setMeta('spotifyProfile', {
    id: profile.id,
    displayName: profile.display_name,
    country: profile.country,
    product: profile.product,
  })

  return { profile, harvested, recent }
}
