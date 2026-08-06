import { useEffect, useState, useRef, useMemo } from 'react'
import { ensureMockData, getApi, getGroundTruth } from './lib/source.js'
import { getAllPlays, getPlayRange, getMeta } from './lib/db.js'
import { resolveWindow, filterPlays, bucketPlays, DEFAULT_PRESET } from './lib/stats/window.js'
import Wordmark from './components/Wordmark.jsx'
import TimeWindowBar from './components/TimeWindowBar.jsx'

// Guards against React's development-mode double-effect firing two generations
// at once on first load.
let bootstrapPromise = null

export default function App() {
  const [status, setStatus] = useState('Starting up')
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)

  const [plays, setPlays] = useState([])
  const [dataRange, setDataRange] = useState(null)
  const [truth, setTruth] = useState(null)
  const [apiCheck, setApiCheck] = useState(null)
  const [preset, setPreset] = useState(DEFAULT_PRESET)

  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    boot()
  }, [])

  async function boot(force = false) {
    setReady(false)
    setError(null)
    try {
      if (!bootstrapPromise || force) {
        bootstrapPromise = ensureMockData({ force, onProgress: setStatus })
      }
      await bootstrapPromise

      setStatus('Reading it back')
      const [allPlays, range, groundTruth] = await Promise.all([getAllPlays(), getPlayRange(), getGroundTruth()])
      setPlays(allPlays)
      setDataRange(range)
      setTruth(groundTruth)
      setApiCheck(await runApiCheck())
      setReady(true)
    } catch (err) {
      console.error(err)
      setError(err.message)
    }
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
        <p style={{ color: 'var(--text-dim)', fontFamily: 'ui-monospace, monospace' }}>{error}</p>
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

      <TimeWindowBar value={preset} onChange={setPreset} range={{ from: win.from, to: win.to }} />

      <section style={{ marginTop: '2.5rem' }}>
        <div className="eyebrow">{win.label}</div>
        <h1 style={{ fontSize: 'clamp(2.4rem, 7vw, 5rem)', margin: '0.35rem 0 0' }}>
          {formatDuration(view.msPlayed)}
        </h1>
        <div style={{ color: 'var(--text-dim)', marginTop: '0.6rem', fontSize: '1rem' }}>
          {view.plays.toLocaleString()} plays · {view.tracks.toLocaleString()} tracks · {view.artists.toLocaleString()} artists
          {view.change != null && <> · {formatChange(view.change)} on previous</>}
        </div>

        <Sparkline series={view.series} label={win.label} />
      </section>

      <details style={details}>
        <summary style={summary}>Foundation check</summary>

        <div style={{ padding: '0.25rem 0 1rem' }}>
          <div className="eyebrow" style={{ marginTop: '1.25rem' }}>Dataset</div>
          <div style={grid}>
            <Stat label="Plays stored" value={plays.length.toLocaleString()} />
            <Stat label="Date range" value={`${fmtDate(dataRange.from)} → ${fmtDate(dataRange.to)}`} />
            <Stat label="Unique tracks" value={truth.uniqueTracks.toLocaleString()} />
            <Stat label="Unique artists" value={truth.uniqueArtists.toLocaleString()} />
          </div>

          <div className="eyebrow" style={{ marginTop: '1.75rem' }}>Planted facts to rediscover</div>
          <div style={grid}>
            <Stat label="Most played song" value={`${truth.topTrack.name} · ${truth.topTrack.plays}`} />
            <Stat label="Most played artist" value={`${truth.topArtistByPlays.name} · ${truth.topArtistByPlays.plays}`} />
            <Stat label="Abandoned after year one" value={truth.abandonedArtists.slice(0, 3).join(', ')} />
            <Stat label="Obsessions / seasons" value={`${truth.burstArtists.length} / ${truth.seasonalArtists.length}`} />
          </div>

          <div className="eyebrow" style={{ marginTop: '1.75rem' }}>Mock API</div>
          <div style={grid}>
            <Stat label="Profile" value={apiCheck.profile} />
            <Stat label="Top artist · 4 weeks" value={apiCheck.short} />
            <Stat label="Top artist · 6 months" value={apiCheck.medium} />
            <Stat label="Top artist · 1 year" value={apiCheck.long} />
          </div>

          <button style={{ marginTop: '1.5rem' }} onClick={() => boot(true)}>
            Regenerate demo data
          </button>
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
      aria-label={`Plays per ${series.length > 40 ? 'period' : 'bucket'} across ${label}`}
    >
      <line x1="0" y1={h - pad.bottom} x2={w} y2={h - pad.bottom} stroke="var(--line)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
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
  marginTop: '4rem',
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

async function runApiCheck() {
  const api = await getApi()
  const [profile, short, medium, long] = await Promise.all([
    api.getProfile(),
    api.getTopArtists('short_term', 1),
    api.getTopArtists('medium_term', 1),
    api.getTopArtists('long_term', 1),
  ])
  return {
    profile: profile.display_name,
    short: short.items[0] ? short.items[0].name : '—',
    medium: medium.items[0] ? medium.items[0].name : '—',
    long: long.items[0] ? long.items[0].name : '—',
  }
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
