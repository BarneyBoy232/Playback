import { useEffect, useState, useRef, useMemo } from 'react'
import { ensureMockData, getApi, getGroundTruth, getDataSource, activateSpotify, SOURCE_MOCK } from './lib/source.js'
import { getAllPlays, getPlayRange, getMeta } from './lib/db.js'
import { completeLogin, isConnected } from './lib/spotify/auth.js'
import { fullSync } from './lib/spotify/sync.js'
import { resolveWindow, filterPlays, bucketPlays, DEFAULT_PRESET } from './lib/stats/window.js'
import Wordmark from './components/Wordmark.jsx'
import TimeWindowBar from './components/TimeWindowBar.jsx'
import SpotifyPanel from './components/SpotifyPanel.jsx'

export default function App() {
  const [status, setStatus] = useState('Starting up')
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)

  const [plays, setPlays] = useState([])
  const [dataRange, setDataRange] = useState(null)
  const [truth, setTruth] = useState(null)
  const [source, setSource] = useState(SOURCE_MOCK)
  const [connected, setConnected] = useState(false)
  const [profile, setProfile] = useState(null)
  const [preset, setPreset] = useState(DEFAULT_PRESET)

  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    boot()
  }, [])

  // The app starts empty. Nothing is invented on first load — an app that
  // greets you with 66,000 fabricated plays is indistinguishable from one
  // showing your real listening, which is a bad way to meet a data tool.
  // Demo data is available on request, from the panel at the bottom.
  async function boot() {
    setReady(false)
    setError(null)
    try {
      // Coming back from Spotify's approval page. Spotify returns to the site's
      // own front page with a code in the query string, so the check is for the
      // code itself rather than for a particular path — which is what lets the
      // same code work on a static host with no routing.
      //
      // This has to run before anything else touches the database, because
      // connecting wipes the demo data before real plays are written.
      const search = new URLSearchParams(window.location.search)
      if (search.has('code') || search.has('error')) {
        setStatus('Finishing Spotify login')
        await completeLogin(search)
        await activateSpotify()
        await fullSync(await getApi(), setStatus)
        // Strip the code out of the address bar so a refresh cannot try to
        // redeem it a second time.
        window.history.replaceState({}, '', import.meta.env.BASE_URL)
      }

      setStatus('Loading your listening')
      await refresh()
      setReady(true)
    } catch (err) {
      console.error(err)
      setError(err.message)
    }
  }

  /** Fill the app with generated demo data, on explicit request only. */
  async function loadDemo() {
    setReady(false)
    try {
      await ensureMockData({ force: true, onProgress: setStatus })
      await refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setReady(true)
    }
  }

  async function refresh(knownSource = null) {
    const currentSource = knownSource || (await getDataSource())
    const [allPlays, range, groundTruth, linked, storedProfile] = await Promise.all([
      getAllPlays(),
      getPlayRange(),
      getGroundTruth(),
      isConnected(),
      getMeta('spotifyProfile'),
    ])
    setPlays(allPlays)
    setDataRange(range)
    setTruth(groundTruth)
    setSource(currentSource)
    setConnected(linked)
    setProfile(storedProfile)
  }

  // "Now" is pinned to the newest play rather than the real clock. With demo
  // data that keeps every window populated; with real data the two are the same
  // thing within a couple of minutes.
  const now = dataRange ? dataRange.to + 1 : Date.now()

  const win = useMemo(() => resolveWindow(preset, { now, dataRange }), [preset, now, dataRange])

  const view = useMemo(() => {
    if (!plays.length) return null
    const inWindow = filterPlays(plays, win.from, win.to)
    const previous = win.previous ? filterPlays(plays, win.previous.from, win.previous.to) : null
    return {
      plays: inWindow.length,
      msPlayed: inWindow.reduce((sum, p) => sum + p.msPlayed, 0),
      artists: new Set(inWindow.map((p) => p.artistName)).size,
      tracks: new Set(inWindow.map((p) => p.trackUri)).size,
      change: previous && previous.length ? (inWindow.length - previous.length) / previous.length : null,
      series: bucketPlays(inWindow, win.from, win.to, win.bucket),
    }
  }, [plays, win])

  if (error) {
    return (
      <Shell>
        <Wordmark size="md" />
        <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', marginTop: '3rem' }}>Something broke</h1>
        <p style={{ color: 'var(--text-dim)', fontFamily: 'ui-monospace, monospace', maxWidth: '70ch' }}>{error}</p>
        <button style={{ marginTop: '1.5rem' }} onClick={() => boot()}>
          Try again
        </button>
      </Shell>
    )
  }

  if (!ready) {
    return (
      <Shell center>
        <Wordmark size="lg" />
        <div className="eyebrow" style={{ marginTop: '2.5rem' }}>
          {status}…
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <header style={{ marginBottom: '1.75rem' }}>
        <Wordmark size="md" />
      </header>

      {view && <TimeWindowBar value={preset} onChange={setPreset} range={{ from: win.from, to: win.to }} />}

      {view ? (
        <section style={{ marginTop: '2.5rem' }}>
          <div className="eyebrow">{win.label}</div>
          <h1 style={{ fontSize: 'clamp(2.4rem, 7vw, 5rem)', margin: '0.35rem 0 0' }}>
            {formatDuration(view.msPlayed)}
          </h1>
          <div style={{ color: 'var(--text-dim)', marginTop: '0.6rem', fontSize: '1rem' }}>
            {view.plays.toLocaleString()} plays · {view.tracks.toLocaleString()} tracks ·{' '}
            {view.artists.toLocaleString()} artists
            {view.change != null && <> · {formatChange(view.change)} on previous</>}
          </div>
          <Sparkline series={view.series} label={win.label} />
        </section>
      ) : (
        <section style={{ marginTop: '1rem', borderTop: '1px solid var(--line)', paddingTop: '2.5rem' }}>
          <h1 style={{ fontSize: 'clamp(2rem, 6vw, 3.6rem)', maxWidth: '18ch' }}>
            {connected ? 'No plays collected yet' : 'Nothing here yet'}
          </h1>
          <p style={{ color: 'var(--text-dim)', maxWidth: '54ch', lineHeight: 1.6, marginTop: '1rem' }}>
            {connected
              ? 'Sync recent plays below to start collecting. Spotify only hands over the last 50 at a time, so a lifetime export is still the way to get real history.'
              : 'Link a Spotify account below and Playback starts building a record of everything you listen to. A lifetime streaming export can be imported on top of it for the years that came before.'}
          </p>
        </section>
      )}

      <section style={{ marginTop: '3rem' }}>
        <SpotifyPanel connected={connected} profile={profile} source={source} onChanged={() => refresh()} />
      </section>

      <details style={details}>
        <summary style={summary}>Foundation check</summary>

        <div style={{ padding: '0.25rem 0 1rem' }}>
          <div className="eyebrow" style={{ marginTop: '1.25rem' }}>Dataset</div>
          <div style={grid}>
            <Stat
              label="Source"
              value={connected ? 'Spotify account' : truth ? 'Demo data' : 'Empty'}
            />
            <Stat label="Plays stored" value={plays.length.toLocaleString()} />
            <Stat
              label="Date range"
              value={dataRange ? `${fmtDate(dataRange.from)} → ${fmtDate(dataRange.to)}` : '—'}
            />
            <Stat label="Estimated plays" value={plays.filter((p) => p.estimated).length.toLocaleString()} />
          </div>

          {truth && (
            <>
              <div className="eyebrow" style={{ marginTop: '1.75rem' }}>Planted facts to rediscover</div>
              <div style={grid}>
                <Stat label="Most played song" value={`${truth.topTrack.name} · ${truth.topTrack.plays}`} />
                <Stat
                  label="Most played artist"
                  value={`${truth.topArtistByPlays.name} · ${truth.topArtistByPlays.plays}`}
                />
                <Stat label="Abandoned after year one" value={truth.abandonedArtists.slice(0, 3).join(', ')} />
                <Stat
                  label="Obsessions / seasons"
                  value={`${truth.burstArtists.length} / ${truth.seasonalArtists.length}`}
                />
              </div>
            </>
          )}

          {!connected && (
            <>
              <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', lineHeight: 1.5, marginTop: '1.75rem', maxWidth: '60ch' }}>
                Demo data is four years of invented listening, generated in your browser. Useful for
                seeing what the app does before connecting anything real. Loading it replaces
                whatever is stored.
              </p>
              <button style={{ marginTop: '0.75rem' }} onClick={loadDemo}>
                Load demo data
              </button>
            </>
          )}
        </div>
      </details>
    </Shell>
  )
}

// A single white line with its period named at the end — the direct-labelling
// rule that lets the charts work without any colour.
function Sparkline({ series, label }) {
  if (!series || series.length < 2) return null

  const w = 900
  const h = 150
  const pad = { top: 12, right: 8, bottom: 22, left: 0 }
  const max = Math.max(...series.map((b) => b.plays), 1)
  const stepX = (w - pad.left - pad.right) / (series.length - 1)

  const points = series
    .map((b, i) => {
      const x = pad.left + i * stepX
      const y = pad.top + (1 - b.plays / max) * (h - pad.top - pad.bottom)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  const last = series[series.length - 1]
  const lastY = pad.top + (1 - last.plays / max) * (h - pad.top - pad.bottom)

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height: 150, marginTop: '2rem', display: 'block' }}
      role="img"
      aria-label={`Plays over ${label}`}
    >
      <line
        x1="0"
        y1={h - pad.bottom}
        x2={w}
        y2={h - pad.bottom}
        stroke="var(--line)"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
      <polyline
        points={points}
        fill="none"
        stroke="var(--white)"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
      <circle cx={w - pad.right} cy={lastY} r="3" fill="var(--white)" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function Shell({ children, center = false }) {
  const base = { maxWidth: 1100, margin: '0 auto', padding: 'clamp(1.5rem, 5vw, 4rem)' }
  if (!center) return <div style={base}>{children}</div>
  return (
    <div
      style={{
        ...base,
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </div>
  )
}

// Cards are separated from the background by a hairline border rather than a
// fill, which is what keeps the black reading as genuinely black.
function Stat({ label, value }) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius)',
        padding: '1.1rem 1.25rem',
      }}
    >
      <div className="eyebrow">{label}</div>
      <div style={{ marginTop: '0.45rem', fontSize: '1.05rem', fontWeight: 600, lineHeight: 1.3 }}>{value}</div>
    </div>
  )
}

const grid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
  gap: '0.75rem',
  marginTop: '0.75rem',
}

const details = {
  marginTop: '3.5rem',
  borderTop: '1px solid var(--line)',
  paddingTop: '1rem',
}

const summary = {
  cursor: 'pointer',
  fontSize: '0.7rem',
  fontWeight: 600,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: 'var(--text-faint)',
}

function fmtDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatDuration(ms) {
  const totalMinutes = Math.round(ms / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours < 1) return `${minutes}m`
  if (hours < 100) return `${hours}h ${String(minutes).padStart(2, '0')}m`
  return `${hours.toLocaleString()}h`
}

function formatChange(fraction) {
  const pct = Math.round(fraction * 100)
  if (pct === 0) return 'level'
  return `${pct > 0 ? '+' : ''}${pct}%`
}
