// Live Spotify Web API client.
//
// Exposes exactly the same functions as the mock client in mock/apiFixtures.js,
// so switching between demo data and a real account changes nothing but which
// object the app is handed.
//
// Restricted to what Development Mode still allows after February 2026. Bulk
// metadata lookup (GET /artists, /albums, /tracks) no longer exists, so artwork
// and genres are harvested from responses that arrive anyway rather than being
// fetched on demand.

import { getAccessToken } from './auth.js'

const BASE = 'https://api.spotify.com/v1'

export function createSpotifyApi() {
  /**
   * One request, with the access token attached.
   *
   * Handles the two failures that actually happen in practice: an expired
   * token, and rate limiting. Spotify answers a rate limit with 429 and a
   * Retry-After header in seconds, and expects the caller to wait rather than
   * hammer it.
   */
  async function request(path, { retryOn401 = true } = {}) {
    const token = await getAccessToken()
    if (!token) throw new Error('Not connected to Spotify.')

    const response = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (response.status === 429) {
      const wait = Number(response.headers.get('Retry-After') || 2)
      await sleep((wait + 1) * 1000)
      return request(path, { retryOn401 })
    }

    // A 401 after a successful token fetch means the token was revoked or the
    // stored one was stale. One retry forces a refresh; a second failure is real.
    if (response.status === 401 && retryOn401) {
      return request(path, { retryOn401: false })
    }

    if (response.status === 403) {
      // Overwhelmingly the cause in Development Mode, and the fix is specific
      // enough to be worth spelling out rather than leaving as a status code.
      throw new Error(
        'Spotify refused access (403). This account has not been added to the app yet. ' +
          'The app owner needs to open developer.spotify.com/dashboard, select the app, ' +
          'go to Settings then User Management, and add this account\'s name and the email ' +
          'address its Spotify account uses. Up to five accounts are allowed.',
      )
    }

    if (response.status === 204) return null

    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      const detail = body.error?.message || response.statusText
      throw new Error(`Spotify request failed (${response.status}): ${detail}`)
    }

    return response.json()
  }

  /**
   * Follow Spotify's `next` links until everything has been collected.
   * Saved tracks in particular routinely run to thousands of items.
   */
  async function paginate(path, { pageSize = 50, max = 10000 } = {}) {
    const items = []
    const joiner = path.includes('?') ? '&' : '?'
    let next = `${path}${joiner}limit=${pageSize}`

    while (next && items.length < max) {
      const page = await request(next)
      if (!page) break

      const collection = page.items ? page : page.artists
      if (!collection || !collection.items) break

      items.push(...collection.items)

      // `next` comes back as a full URL; strip the base so request() can use it.
      next = collection.next ? collection.next.replace(BASE, '') : null
    }

    return { items, total: items.length }
  }

  return {
    isMock: false,

    getProfile() {
      return request('/me')
    },

    getTopTracks(range = 'medium_term', limit = 50) {
      return request(`/me/top/tracks?time_range=${range}&limit=${limit}`)
    },

    getTopArtists(range = 'medium_term', limit = 50) {
      return request(`/me/top/artists?time_range=${range}&limit=${limit}`)
    },

    /**
     * The last 50 plays, and only tracks listened to for more than 30 seconds.
     * `after` is a millisecond timestamp — passing the newest play already
     * stored is what makes polling cheap.
     */
    getRecentlyPlayed(after = null) {
      const params = new URLSearchParams({ limit: '50' })
      if (after) params.set('after', String(after))
      return request(`/me/player/recently-played?${params}`)
    },

    getCurrentlyPlaying() {
      // Returns 204 with no body when nothing is playing, which request() turns
      // into null.
      return request('/me/player/currently-playing')
    },

    getSavedTracks() {
      return paginate('/me/tracks')
    },

    getSavedAlbums() {
      return paginate('/me/albums')
    },

    getPlaylists() {
      return paginate('/me/playlists')
    },

    getFollowedArtists() {
      return paginate('/me/following?type=artist')
    },

    /**
     * Search is the only remaining way to resolve an artist we have a name for
     * but no metadata on. It now returns at most 10 results, so it is a trickle
     * rather than a way to backfill thousands of artists.
     */
    async searchArtists(query, limit = 10) {
      const params = new URLSearchParams({
        q: query,
        type: 'artist',
        limit: String(Math.min(limit, 10)),
      })
      return request(`/search?${params}`)
    },
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
