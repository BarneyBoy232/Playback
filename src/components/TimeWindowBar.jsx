import { PRESETS } from '../lib/stats/window.js'

// The one control that drives the whole dashboard.
//
// Styling follows the two-tone rule: the selected period is the only filled
// element on the row, so which window you are looking at is obvious without a
// colour to mark it.

export default function TimeWindowBar({ value, onChange, range }) {
  return (
    <div style={wrap}>
      <div style={row} role="group" aria-label="Time period">
        {PRESETS.map((preset) => {
          const active = preset.id === value
          return (
            <button
              key={preset.id}
              onClick={() => onChange(preset.id)}
              aria-pressed={active}
              className={active ? 'primary' : ''}
              style={pill}
            >
              <span className="tw-full">{preset.label}</span>
              <span className="tw-short">{preset.short}</span>
            </button>
          )
        })}
      </div>
      {range && (
        <div className="eyebrow" style={{ marginTop: '0.85rem' }}>
          {formatRange(range.from, range.to)}
        </div>
      )}
    </div>
  )
}

function formatRange(from, to) {
  const opts = { day: 'numeric', month: 'short', year: 'numeric' }
  return `${new Date(from).toLocaleDateString(undefined, opts)} → ${new Date(to).toLocaleDateString(undefined, opts)}`
}

const wrap = {
  borderTop: '1px solid var(--line)',
  borderBottom: '1px solid var(--line)',
  padding: '1.1rem 0',
}

const row = {
  display: 'flex',
  gap: '0.5rem',
  flexWrap: 'wrap',
}

const pill = {
  padding: '0.5rem 1rem',
  fontSize: '0.85rem',
}
