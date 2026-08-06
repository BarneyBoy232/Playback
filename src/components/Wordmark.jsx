import { BRAND } from '../brand.js'

// The logo. It is drawn as SVG rather than stored as an image file so it stays
// razor sharp at any size, recolours with the theme, and changes instantly if
// the app name changes.
//
// Three sizes cover everywhere it appears:
//   lg — the landing/loading screen
//   md — the dashboard header
//   sm — tight spaces, and the tagline is dropped

const SIZES = {
  lg: { font: 44, tracking: 5, tagline: 13, taglineTracking: 7.5, gap: 26, rule: 2 },
  md: { font: 23, tracking: 2.8, tagline: 8.5, taglineTracking: 4.2, gap: 15, rule: 1.5 },
  sm: { font: 15, tracking: 2, tagline: 0, taglineTracking: 0, gap: 0, rule: 1 },
}

export default function Wordmark({ size = 'md', showTagline = true, name = BRAND.name, tagline = BRAND.tagline }) {
  const s = SIZES[size] || SIZES.md
  const withTagline = showTagline && s.tagline > 0

  // The mark is centred, so the drawing width follows the length of the name.
  const width = Math.max(name.length * (s.font * 0.78), 120)
  const height = withTagline ? s.font + s.gap + s.tagline + 18 : s.font + 8
  const cx = width / 2
  const baseline = s.font

  // The hairline rule sits under the name, inset a little at both ends.
  const ruleY = baseline + s.gap * 0.55
  const ruleInset = width * 0.14

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${name} — ${tagline}`}
      style={{ display: 'block' }}
    >
      <text
        x={cx}
        y={baseline}
        textAnchor="middle"
        fill="currentColor"
        fontFamily="ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
        fontSize={s.font}
        fontWeight="800"
        letterSpacing={s.tracking}
      >
        {name.toUpperCase()}
      </text>

      {withTagline && (
        <>
          <line
            x1={ruleInset}
            y1={ruleY}
            x2={width - ruleInset}
            y2={ruleY}
            stroke="currentColor"
            strokeWidth={s.rule}
            opacity="0.3"
          />
          <text
            x={cx}
            y={ruleY + s.gap * 0.9 + s.tagline * 0.4}
            textAnchor="middle"
            fill="currentColor"
            opacity="0.48"
            fontFamily="ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
            fontSize={s.tagline}
            fontWeight="500"
            letterSpacing={s.taglineTracking}
          >
            {tagline.toUpperCase()}
          </text>
        </>
      )}
    </svg>
  )
}
