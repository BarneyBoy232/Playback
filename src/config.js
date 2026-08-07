// Spotify application settings.
//
// The Client ID is a PUBLIC identifier. It is visible in the browser's network
// tab of any app that uses it, and Spotify designs it that way — which is why
// this app uses the PKCE flow and holds no client secret at all. What actually
// protects the app is the redirect URI whitelist: Spotify will only ever send a
// login result back to an address registered in the dashboard.
//
// It can still be overridden by an environment variable, which is how it would
// be supplied on a hosting platform without editing the code.

export const SPOTIFY_CLIENT_ID =
  import.meta.env?.VITE_SPOTIFY_CLIENT_ID || '88f1eef784914d1d9580e3fdb5796dda'

// Must match a Redirect URI registered in the Spotify dashboard exactly.
// Spotify rejects "localhost" — the numeric loopback address is required.
export function redirectUri() {
  return `${window.location.origin}/callback`
}

// Read-only access, and nothing more than the app actually reads.
export const SCOPES = [
  'user-read-private',
  'user-read-email',
  'user-top-read',
  'user-read-recently-played',
  'user-library-read',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-follow-read',
  'user-read-currently-playing',
]
