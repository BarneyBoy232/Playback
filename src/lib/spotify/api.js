// Live Spotify Web API client.
//
// Not implemented yet — the app runs entirely on demo data until a Spotify
// account and Client ID are available. This file exists now so the data-source
// switch in source.js has something to import, and so the shape of the real
// client is pinned to match the mock one in mock/apiFixtures.js.
//
// When this is filled in, it must expose exactly the same functions the mock
// client does: getProfile, getTopTracks, getTopArtists, getRecentlyPlayed,
// getCurrentlyPlaying, getSavedTracks, getSavedAlbums, getPlaylists,
// getFollowedArtists, searchArtists.
//
// Note there is no bulk metadata lookup in that list. February 2026 removed
// GET /artists, GET /albums and GET /tracks from Development Mode, so artwork
// and genres have to be harvested from the responses above as they arrive
// rather than fetched on demand.

export function createSpotifyApi() {
  throw new Error(
    'Spotify is not connected yet. The app is running on demo data — ' +
      'a Client ID is needed before the live API can be used.',
  )
}
