// Fake responses that mirror the real Spotify Web API, shape for shape.
//
// The point is that swapping between mock and real data is a one-line source
// toggle rather than a refactor: both sides expose the exact same functions and
// return the exact same object shapes.
//
// FEBRUARY 2026 DEVELOPER MODE RESTRICTIONS
// Spotify cut Development Mode down to a smaller set of endpoints. This mock
// deliberately mirrors those limits rather than the older, wider API, because a
// mock that offers more than reality is worse than no mock at all.
//
// Gone, and therefore not implemented here:
//   GET /artists, GET /albums, GET /tracks  — bulk metadata lookup by id
//   popularity (track, artist, album), followers (artist), available_markets
//
// Search survives but is capped at 10 results, down from 50.
//
// The practical consequence: artwork and genres can only be harvested from
// responses we already receive — top artists, top tracks, saved items,
// playlists — rather than looked up on demand. Anything in the lifetime export
// that never appears in one of those falls back to a generated colour block.
//
// Note there are no image URLs here. Real Spotify responses include artwork
// links, but those require the network — so mock artwork is left empty and the
// UI falls back to a colour block generated from the name. That fallback is
// needed for real data anyway, since plenty of artists have no image.

import { makeRng, randInt, pick } from './rng.js'

// Spotify's three fixed windows, in days. Their exact algorithm is undocumented
// and weights recent plays more heavily, so these are approximations — which is
// fine, because the whole reason this app exists is that these windows are too
// coarse.
const RANGE_DAYS = {
  short_term: 28,
  medium_term: 182,
  long_term: 365,
}

/**
 * Build a mock API client from a generated catalogue and history.
 *
 * @param {object} opts
 * @param {object} opts.catalogue Output of buildCatalogue().
 * @param {Array} opts.plays      Clean play records (post-parse).
 * @param {number} opts.now       Epoch ms treated as "now".
 */
export function createMockApi({ catalogue, plays, now, seed = 77 }) {
  const rng = makeRng(seed)
  const artistsByName = new Map(catalogue.artists.map((a) => [a.name, a]))

  // Sorted once so range queries are cheap.
  const sorted = [...plays].sort((a, b) => a.ts - b.ts)

  function playsInLastDays(days) {
    const from = now - days * 86400000
    return sorted.filter((p) => p.ts >= from)
  }

  function rank(items, keyFn) {
    const counts = new Map()
    for (const p of items) {
      const k = keyFn(p)
      counts.set(k, (counts.get(k) || 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }

  function trackObject(track) {
    const artist = artistsByName.get(track.artistName)
    return {
      id: track.uri.split(':')[2],
      uri: track.uri,
      name: track.name,
      duration_ms: track.durationMs,
      // No `popularity` — removed from track objects in February 2026.
      explicit: track.explicit,
      track_number: track.trackNumber,
      artists: [{ id: artist ? artist.id : 'unknown', name: track.artistName, uri: `spotify:artist:${artist ? artist.id : 'unknown'}` }],
      album: {
        id: track.albumId,
        name: track.albumName,
        uri: `spotify:album:${track.albumId}`,
        release_date: albumReleaseDate(track),
        images: [],
      },
    }
  }

  function albumReleaseDate(track) {
    const artist = artistsByName.get(track.artistName)
    const album = artist && artist.albums.find((al) => al.id === track.albumId)
    return album ? album.releaseDate : '2020-01-01'
  }

  function artistObject(artist) {
    return {
      id: artist.id,
      uri: `spotify:artist:${artist.id}`,
      name: artist.name,
      // Genres survived the cull, which matters — they are the only source of
      // genre data the app has. `popularity` and `followers` did not.
      genres: artist.genres,
      images: [],
    }
  }

  return {
    isMock: true,

    async getProfile() {
      return {
        id: 'mockuser',
        display_name: 'Demo Listener',
        email: 'demo@example.com',
        country: 'AU',
        product: 'premium',
        followers: { total: 42 },
        images: [],
        external_urls: { spotify: 'https://open.spotify.com/user/mockuser' },
      }
    },

    async getTopTracks(range = 'medium_term', limit = 50) {
      const window = playsInLastDays(RANGE_DAYS[range] || 182)
      const ranked = rank(window, (p) => p.trackUri).slice(0, limit)
      return {
        items: ranked
          .map(([uri]) => catalogue.tracksByUri.get(uri))
          .filter(Boolean)
          .map(trackObject),
        total: ranked.length,
      }
    },

    async getTopArtists(range = 'medium_term', limit = 50) {
      const window = playsInLastDays(RANGE_DAYS[range] || 182)
      const ranked = rank(window, (p) => p.artistName).slice(0, limit)
      return {
        items: ranked
          .map(([name]) => artistsByName.get(name))
          .filter(Boolean)
          .map(artistObject),
        total: ranked.length,
      }
    },

    // The real endpoint returns at most the last 50 plays, and only tracks
    // listened to for more than 30 seconds. Mirrored here so the poller is
    // written against the real constraints.
    async getRecentlyPlayed(after = null) {
      let items = sorted.filter((p) => p.msPlayed > 30000)
      if (after) items = items.filter((p) => p.ts > after)
      items = items.slice(-50).reverse()
      return {
        items: items.map((p) => ({
          played_at: new Date(p.ts).toISOString(),
          track: trackObject(catalogue.tracksByUri.get(p.trackUri) || fallbackTrack(p)),
          context: p.shuffle ? { type: 'playlist' } : { type: 'album' },
        })),
        cursors: items.length ? { after: String(items[0].ts) } : null,
      }
    },

    async getCurrentlyPlaying() {
      return null // Nothing playing in demo mode.
    },

    async getSavedTracks(limit = 500) {
      const picks = []
      for (let i = 0; i < limit && i < catalogue.allTracks.length; i++) {
        const track = catalogue.allTracks[randInt(rng, 0, catalogue.allTracks.length - 1)]
        picks.push({
          added_at: new Date(now - randInt(rng, 1, 1400) * 86400000).toISOString(),
          track: trackObject(track),
        })
      }
      return { items: picks, total: picks.length }
    },

    async getSavedAlbums(limit = 120) {
      const items = []
      for (let i = 0; i < limit; i++) {
        const artist = pick(rng, catalogue.artists)
        const album = pick(rng, artist.albums)
        items.push({
          added_at: new Date(now - randInt(rng, 1, 1400) * 86400000).toISOString(),
          album: {
            id: album.id,
            uri: `spotify:album:${album.id}`,
            name: album.name,
            release_date: album.releaseDate,
            total_tracks: album.trackUris.length,
            artists: [{ id: artist.id, name: artist.name }],
            images: [],
          },
        })
      }
      return { items, total: items.length }
    },

    async getPlaylists() {
      const names = ['Driving', 'Focus', 'Sunday Morning', 'Gym', 'Rainy Day', 'Party', 'Sleep', 'Discover Later']
      return {
        items: names.map((name, i) => ({
          id: `playlist${i}`,
          uri: `spotify:playlist:playlist${i}`,
          name,
          public: i % 2 === 0,
          collaborative: false,
          tracks: { total: randInt(rng, 12, 240) },
          owner: { display_name: 'Demo Listener' },
          images: [],
        })),
        total: names.length,
      }
    },

    async getFollowedArtists(limit = 90) {
      const items = []
      const seen = new Set()
      while (items.length < limit) {
        const artist = pick(rng, catalogue.artists)
        if (seen.has(artist.id)) continue
        seen.add(artist.id)
        items.push(artistObject(artist))
      }
      return { artists: { items, total: items.length } }
    },

    // Bulk metadata lookup (GET /artists, /albums, /tracks) no longer exists in
    // Development Mode. Search is the only way to resolve an artist we have a
    // name for but no metadata on — and it now returns at most 10 results, so
    // it is a slow trickle rather than a way to backfill thousands of artists.
    async searchArtists(query, limit = 10) {
      const capped = Math.min(limit, 10)
      const needle = query.toLowerCase()
      const hits = catalogue.artists.filter((a) => a.name.toLowerCase().includes(needle)).slice(0, capped)
      return { artists: { items: hits.map(artistObject), limit: capped } }
    },
  }

  // If a play references a track the catalogue does not know about (shouldn't
  // happen with generated data, but will happen with real data eventually),
  // build a minimal stand-in rather than crashing.
  function fallbackTrack(play) {
    return {
      uri: play.trackUri,
      name: play.trackName,
      artistName: play.artistName,
      albumName: play.albumName,
      albumId: 'unknown',
      durationMs: play.msPlayed,
      popularity: 0,
      explicit: false,
      trackNumber: 1,
    }
  }
}
