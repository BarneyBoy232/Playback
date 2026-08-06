// Fake responses that mirror the real Spotify Web API, shape for shape.
//
// The point is that swapping between mock and real data is a one-line source
// toggle rather than a refactor: both sides expose the exact same functions and
// return the exact same object shapes.
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
      popularity: track.popularity,
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
      genres: artist.genres,
      popularity: artist.popularity,
      followers: { total: Math.round(artist.popularity * 1000 + 500) },
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

    async getArtists(ids) {
      const byId = new Map(catalogue.artists.map((a) => [a.id, a]))
      return { artists: ids.map((id) => (byId.has(id) ? artistObject(byId.get(id)) : null)).filter(Boolean) }
    },

    async getArtistsByName(names) {
      return { artists: names.map((n) => artistsByName.get(n)).filter(Boolean).map(artistObject) }
    },

    async getTracks(uris) {
      return {
        tracks: uris.map((u) => catalogue.tracksByUri.get(u)).filter(Boolean).map(trackObject),
      }
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
