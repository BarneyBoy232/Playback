// Spotify login, using the Authorization Code flow with PKCE.
//
// PKCE exists so that an app with no server can log a user in safely. Instead
// of proving itself with a client secret — which a browser app cannot keep
// secret — it invents a random string called a verifier, sends only a hash of
// it when asking for permission, and reveals the original when exchanging the
// result for a token. Anyone who intercepts the redirect gets a code they
// cannot use, because they do not have the verifier.
//
// The practical upshot: this app contains no secret of any kind.

import { SPOTIFY_CLIENT_ID, SCOPES, redirectUri } from '../../config.js'
import { getMeta, setMeta, db } from '../db.js'

const AUTH_ENDPOINT = 'https://accounts.spotify.com/authorize'
const TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token'

const TOKEN_KEY = 'spotifyTokens'
// The verifier has to survive a full page navigation to Spotify and back, but
// must not outlive the tab. sessionStorage is exactly that.
const VERIFIER_KEY = 'playback.pkce.verifier'
const STATE_KEY = 'playback.pkce.state'

/** Send the user to Spotify to approve access. This navigates away from the app. */
export async function beginLogin() {
  const verifier = randomString(96)
  const state = randomString(16)
  sessionStorage.setItem(VERIFIER_KEY, verifier)
  sessionStorage.setItem(STATE_KEY, state)

  const challenge = base64url(await sha256(verifier))

  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri(),
    scope: SCOPES.join(' '),
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
  })

  window.location.assign(`${AUTH_ENDPOINT}?${params}`)
}

/**
 * Finish the login after Spotify redirects back.
 * @param {URLSearchParams} search The query string of the callback URL.
 */
export async function completeLogin(search) {
  const error = search.get('error')
  if (error) throw new Error(`Spotify refused the login: ${error}`)

  const code = search.get('code')
  if (!code) throw new Error('Spotify sent no authorisation code back.')

  // The state check is what stops someone else's login result being fed into
  // this app from a link.
  const expectedState = sessionStorage.getItem(STATE_KEY)
  if (!expectedState || search.get('state') !== expectedState) {
    throw new Error('Login state did not match. Start the login again.')
  }

  const verifier = sessionStorage.getItem(VERIFIER_KEY)
  if (!verifier) throw new Error('Login verifier is missing. Start the login again.')

  const tokens = await requestTokens({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(),
    client_id: SPOTIFY_CLIENT_ID,
    code_verifier: verifier,
  })

  sessionStorage.removeItem(VERIFIER_KEY)
  sessionStorage.removeItem(STATE_KEY)

  await storeTokens(tokens)
  return tokens
}

/**
 * A usable access token, refreshed automatically if it has expired.
 * Returns null when the user has never connected, or has disconnected.
 */
export async function getAccessToken() {
  const stored = await getMeta(TOKEN_KEY)
  if (!stored) return null

  // Refresh a minute early rather than waiting for a request to fail.
  if (stored.expiresAt - 60000 > Date.now()) return stored.accessToken
  if (!stored.refreshToken) return null

  const refreshed = await requestTokens({
    grant_type: 'refresh_token',
    refresh_token: stored.refreshToken,
    client_id: SPOTIFY_CLIENT_ID,
  })

  // Spotify does not always issue a new refresh token. When it does not, the
  // existing one stays valid and must be kept.
  const merged = { ...refreshed, refreshToken: refreshed.refreshToken || stored.refreshToken }
  await storeTokens(merged)
  return merged.accessToken
}

export async function isConnected() {
  return Boolean(await getMeta(TOKEN_KEY))
}

/** Forget the tokens. The Spotify account itself is untouched. */
export async function logout() {
  await db.meta.delete(TOKEN_KEY)
  sessionStorage.removeItem(VERIFIER_KEY)
  sessionStorage.removeItem(STATE_KEY)
}

async function requestTokens(body) {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  })

  const json = await response.json().catch(() => ({}))

  if (!response.ok) {
    const detail = json.error_description || json.error || response.status
    throw new Error(`Spotify rejected the token request: ${detail}`)
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token || null,
    expiresAt: Date.now() + (json.expires_in || 3600) * 1000,
    scope: json.scope || '',
  }
}

async function storeTokens(tokens) {
  await setMeta(TOKEN_KEY, tokens)
}

// ---------------------------------------------------------------------------
// PKCE helpers
// ---------------------------------------------------------------------------

function randomString(length) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  let out = ''
  for (const byte of bytes) out += alphabet[byte % alphabet.length]
  return out
}

async function sha256(text) {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
}

// Base64 with the URL-unsafe characters swapped out and padding removed, which
// is what the OAuth spec requires.
function base64url(buffer) {
  let binary = ''
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
