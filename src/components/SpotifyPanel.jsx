import { useState } from 'react'
import { beginLogin, logout } from '../lib/spotify/auth.js'
import { getApi, resetToEmpty } from '../lib/source.js'
import { fullSync, syncRecentPlays } from '../lib/spotify/sync.js'

// Connecting, syncing and disconnecting a real Spotify account.
//
// Deliberately plain: the connection is plumbing, not a feature, so it sits
// quietly rather than dominating the dashboard.

export default function SpotifyPanel({ connected, profile, source, onChanged }) {
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)

  async function connect() {
    setError(null)
    setBusy('Redirecting to Spotify')
    try {
      await beginLogin()
    } catch (err) {
      setError(err.message)
      setBusy(null)
    }
  }

  async function sync(full = false) {
    setError(null)
    setBusy('Syncing')
    try {
      const api = await getApi()
      if (full) await fullSync(api, setBusy)
      else await syncRecentPlays(api)
      await onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  async function disconnect() {
    setBusy('Disconnecting')
    try {
      await logout()
      await resetToEmpty()
      await onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div style={box}>
      <div className="eyebrow">{connected ? 'Connected' : 'Optional · invite only'}</div>

      <div style={{ marginTop: '0.5rem', fontSize: '1.05rem', fontWeight: 600 }}>
        {connected ? profile?.displayName || 'Spotify account' : 'Live sync'}
      </div>

      <p style={note}>
        {connected
          ? 'Live plays are limited to the last 50 tracks and carry no skip or device detail. A lifetime export remains the accurate record.'
          : 'Keeps your history topped up between exports, but Spotify only lets apps like this one connect five hand-invited accounts — so this will refuse you unless you have been added. Importing an export has no such limit and gives far more detail.'}
      </p>

      {error && <p style={{ ...note, color: 'var(--white)' }}>{error}</p>}

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
        {!connected && (
          <button className="primary" onClick={connect} disabled={Boolean(busy)}>
            {busy || 'Connect Spotify'}
          </button>
        )}
        {connected && (
          <>
            <button onClick={() => sync(false)} disabled={Boolean(busy)}>
              {busy || 'Sync recent plays'}
            </button>
            <button onClick={() => sync(true)} disabled={Boolean(busy)}>
              Full refresh
            </button>
            <button onClick={disconnect} disabled={Boolean(busy)}>
              Disconnect
            </button>
          </>
        )}
      </div>

      {source === 'spotify' && !connected && (
        <p style={note}>Tokens are missing or expired. Reconnect to continue.</p>
      )}
    </div>
  )
}

const box = {
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius)',
  padding: '1.25rem 1.35rem',
}

const note = {
  color: 'var(--text-dim)',
  fontSize: '0.85rem',
  lineHeight: 1.5,
  margin: '0.6rem 0 0',
  maxWidth: '60ch',
}
