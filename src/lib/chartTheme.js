// The chart system for a strictly two-tone app.
//
// With no colour available, series have to be separated some other way. Four
// tools do the work, in order of how much they carry:
//
//   1. Direct labelling  — the series name sits at the end of its own line, so
//                          nothing has to be matched against a legend. This is
//                          the single biggest win and replaces colour entirely.
//   2. Line weight       — the series that matters is thick; context is thin.
//   3. Opacity           — recent is bright, older recedes. Reads as depth.
//   4. Dash pattern      — the last resort, and the first thing to become
//                          unreadable, so it is used sparingly.
//
// Past three overlaid series, none of that is enough. At that point the chart
// should be split into SMALL MULTIPLES — the same small chart repeated once per
// period, side by side. In monochrome this is not a compromise: comparing four
// identical small charts is easier than untangling four lines sharing an axis.

/** Hard cap on lines sharing one axis. Beyond this, use small multiples. */
export const MAX_OVERLAY_SERIES = 3

/**
 * Series styles in priority order. The first entry is always the series the
 * viewer is meant to read first — usually the current period.
 */
export const SERIES = [
  { stroke: '#ffffff', strokeWidth: 2.6, strokeDasharray: null, dotFill: '#ffffff' },
  { stroke: 'rgba(255,255,255,0.60)', strokeWidth: 1.6, strokeDasharray: '6 4', dotFill: 'rgba(255,255,255,0.60)' },
  { stroke: 'rgba(255,255,255,0.38)', strokeWidth: 1.3, strokeDasharray: '2 4', dotFill: 'rgba(255,255,255,0.38)' },
]

/** Bars: the leader is solid white, everything else steps back. */
export const BAR = {
  leader: '#ffffff',
  rest: 'rgba(255,255,255,0.34)',
  restHover: 'rgba(255,255,255,0.55)',
  track: 'rgba(255,255,255,0.07)',
}

export const AXIS = {
  line: 'rgba(255,255,255,0.16)',
  grid: 'rgba(255,255,255,0.07)',
  tick: 'rgba(255,255,255,0.42)',
  tickSize: 11,
  label: 'rgba(255,255,255,0.34)',
}

/**
 * Intensity for heatmaps — the calendar grid and the listening clock.
 *
 * `t` is 0 to 1. The curve is deliberately not linear: a straight opacity ramp
 * on black leaves the quiet end invisible, so low values are lifted and the
 * busy end is allowed to reach pure white.
 */
export function heat(t) {
  const clamped = Math.max(0, Math.min(1, t))
  if (clamped === 0) return 'rgba(255,255,255,0.04)'
  const eased = 0.08 + Math.pow(clamped, 0.72) * 0.92
  return `rgba(255,255,255,${eased.toFixed(3)})`
}

/** Fixed steps of the same ramp, for legends and swatches. */
export const HEAT_STEPS = [0, 0.2, 0.4, 0.6, 0.8, 1].map(heat)

/**
 * Style for one series by its position. Anything past the defined set falls
 * back to the faintest style rather than throwing — but hitting that means the
 * chart should have been small multiples instead.
 */
export function seriesStyle(index) {
  return SERIES[index] || SERIES[SERIES.length - 1]
}
