// The first thing a stranger sees.
//
// This leads with the data export rather than a Connect button on purpose.
// Spotify's Development Mode caps an app at five hand-invited accounts, and
// Extended Quota Mode — the thing that would lift that — has been restricted
// since May 2025 to registered businesses with at least 250,000 monthly active
// users. A personal project cannot get it.
//
// The export route has no such limit. Anyone can ask Spotify for their own
// data and drop it here, so that is the path the page is built around.

// Declared before STEPS because STEPS is built when this module loads and uses
// it — a const declared further down would not exist yet.
const link = {
  color: 'var(--white)',
  textUnderlineOffset: '3px',
}

const STEPS = [
  {
    title: 'Ask Spotify for your data',
    body: (
      <>
        Open{' '}
        <a href="https://www.spotify.com/account/privacy/" target="_blank" rel="noreferrer" style={link}>
          spotify.com/account/privacy
        </a>{' '}
        while logged in, and scroll to <em>Download your data</em>.
      </>
    ),
  },
  {
    title: 'Tick Extended streaming history',
    body: (
      <>
        This is the one that matters. The basic <em>Account data</em> option holds no listening
        history at all — if you import it by mistake, Playback will tell you.
      </>
    ),
  },
  {
    title: 'Confirm the email',
    body: 'Spotify sends a confirmation link. The request is not actioned until you click it.',
  },
  {
    title: 'Wait, then drop the file below',
    body: 'Usually a few days. Spotify allows itself up to 30. The zip arrives by email — drag it straight in, no need to unzip it.',
  },
]

export default function GetStarted() {
  return (
    <section style={{ marginTop: '1rem', borderTop: '1px solid var(--line)', paddingTop: '2.5rem' }}>
      <h1 style={{ fontSize: 'clamp(2.1rem, 6.5vw, 4rem)', maxWidth: '16ch' }}>
        Everything you have ever played
      </h1>

      <p style={{ color: 'var(--text-dim)', maxWidth: '58ch', lineHeight: 1.65, marginTop: '1.25rem', fontSize: '1rem' }}>
        Spotify keeps a record of every track you have ever listened to, and will hand you a copy of
        it. Playback reads that file and turns it into the thing Wrapped only shows you once a year —
        for any week, month, year, or your whole listening life.
      </p>

      <p style={{ color: 'var(--text-dim)', maxWidth: '58ch', lineHeight: 1.65, marginTop: '0.9rem', fontSize: '0.92rem' }}>
        It never leaves your browser. There is no account to make, nothing to install, and no server
        holding your listening.
      </p>

      <ol style={list}>
        {STEPS.map((step, i) => (
          <li key={step.title} style={item}>
            <div style={number}>{i + 1}</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>{step.title}</div>
              <div style={{ color: 'var(--text-dim)', fontSize: '0.88rem', lineHeight: 1.55, marginTop: '0.25rem' }}>
                {step.body}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

const list = {
  listStyle: 'none',
  padding: 0,
  margin: '2.25rem 0 0',
  display: 'grid',
  gap: '1.1rem',
  maxWidth: '62ch',
}

const item = {
  display: 'flex',
  gap: '0.95rem',
  alignItems: 'flex-start',
}

// Outlined numerals rather than filled circles — the two-tone palette has no
// spare colour for a filled badge, and an outline reads as a step marker
// without shouting.
const number = {
  flex: '0 0 auto',
  width: 28,
  height: 28,
  borderRadius: '50%',
  border: '1px solid var(--line-strong)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '0.8rem',
  fontWeight: 700,
}
