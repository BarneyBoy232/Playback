// Time windows — the control that drives every number on the dashboard.
//
// One selector at the top of the app decides the period, and every leaderboard,
// chart and stat recomputes from it. That is the whole point of the app: Spotify
// only offers roughly four weeks, six months and a year, and those windows are
// fixed. Here any window is available.
//
// Every window also carries the equivalent PREVIOUS period, so anything on
// screen can show a change ("+18% on previous") without extra plumbing.

export const PRESETS = [
  { id: '7d', label: 'Last 7 days', short: '7D', days: 7, bucket: 'day' },
  { id: '30d', label: 'Last 30 days', short: '30D', days: 30, bucket: 'day' },
  { id: '90d', label: 'Last 90 days', short: '90D', days: 90, bucket: 'week' },
  { id: '12m', label: 'Last 12 months', short: '12M', days: 365, bucket: 'month' },
  { id: 'year', label: 'This year', short: 'YTD', bucket: 'month' },
  { id: 'all', label: 'All time', short: 'ALL', bucket: 'month' },
  { id: 'custom', label: 'Custom', short: '···', bucket: 'auto' },
]

export const DEFAULT_PRESET = '30d'

const DAY_MS = 86400000

/**
 * Turn a preset choice into concrete timestamps.
 *
 * @param {string} presetId
 * @param {object} opts
 * @param {number} opts.now        Treated as the present moment.
 * @param {object} opts.dataRange  { from, to } of everything stored — used by "all time".
 * @param {number} opts.customFrom Only for the custom preset.
 * @param {number} opts.customTo   Only for the custom preset.
 * @returns {{id, label, from, to, bucket, previous: {from, to}}}
 */
export function resolveWindow(presetId, { now, dataRange = null, customFrom = null, customTo = null } = {}) {
  const preset = PRESETS.find((p) => p.id === presetId) || PRESETS.find((p) => p.id === DEFAULT_PRESET)

  let from
  let to = now
  let label = preset.label

  if (preset.id === 'all') {
    from = dataRange ? dataRange.from : now - 365 * DAY_MS
    to = dataRange ? dataRange.to + 1 : now
  } else if (preset.id === 'year') {
    // Local 1 January, for the same reason bucketing is local: "this year"
    // means the listener's year, not UTC's.
    from = new Date(new Date(now).getFullYear(), 0, 1).getTime()
  } else if (preset.id === 'custom') {
    from = customFrom != null ? customFrom : now - 30 * DAY_MS
    to = customTo != null ? customTo : now
    label = `${formatDay(from)} – ${formatDay(to)}`
  } else {
    from = now - preset.days * DAY_MS
  }

  // The previous period is the same length, immediately before this one. For
  // "all time" there is nothing before it, so there is no comparison.
  const span = to - from
  const previous = preset.id === 'all' ? null : { from: from - span, to: from }

  return {
    id: preset.id,
    label,
    from,
    to,
    bucket: preset.bucket === 'auto' ? chooseBucket(from, to) : preset.bucket,
    previous,
  }
}

/**
 * Pick a sensible chart granularity for an arbitrary span. Aiming for roughly
 * 10 to 60 points — fewer looks sparse, more turns into noise.
 */
export function chooseBucket(from, to) {
  const days = (to - from) / DAY_MS
  if (days <= 2) return 'hour'
  if (days <= 70) return 'day'
  if (days <= 400) return 'week'
  return 'month'
}

/** Plays inside a window. `to` is exclusive so adjacent windows never double-count. */
export function filterPlays(plays, from, to) {
  return plays.filter((p) => p.ts >= from && p.ts < to)
}

/**
 * Group plays into evenly spaced buckets for charting.
 * Empty buckets are included on purpose — a gap in listening is information,
 * and dropping it would quietly straighten out the line.
 */
export function bucketPlays(plays, from, to, bucket) {
  const buckets = buildBuckets(from, to, bucket)
  const index = new Map(buckets.map((b, i) => [b.key, i]))

  for (const play of plays) {
    if (play.ts < from || play.ts >= to) continue
    const key = bucketKey(play.ts, bucket)
    const i = index.get(key)
    if (i === undefined) continue
    buckets[i].plays++
    buckets[i].msPlayed += play.msPlayed
  }

  return buckets
}

function buildBuckets(from, to, bucket) {
  const out = []
  let cursor = bucketStart(from, bucket)
  let guard = 0
  while (cursor < to && guard++ < 5000) {
    out.push({ key: bucketKey(cursor, bucket), ts: cursor, plays: 0, msPlayed: 0 })
    cursor = nextBucket(cursor, bucket)
  }
  return out
}

// Bucketing uses LOCAL time, not UTC.
//
// A play is stored as a UTC instant, but "which day did I listen to this" only
// means anything on the listener's own clock. In Australia, 8am local is 10pm
// the previous day in UTC — bucketing by UTC would file every morning commute
// under yesterday and make the whole habits section wrong.
//
// Boundaries are built by constructing local dates rather than adding fixed
// millisecond offsets, so daylight saving transitions cannot drift them.
function bucketStart(ts, bucket) {
  const d = new Date(ts)
  if (bucket === 'hour') return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()).getTime()
  if (bucket === 'day') return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  if (bucket === 'week') {
    // Weeks start Monday. getDay() is Sunday-first, so shift it.
    const offset = (d.getDay() + 6) % 7
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset).getTime()
  }
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime()
}

function nextBucket(ts, bucket) {
  const d = new Date(ts)
  if (bucket === 'hour') return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1).getTime()
  if (bucket === 'day') return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime()
  if (bucket === 'week') return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7).getTime()
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime()
}

function bucketKey(ts, bucket) {
  return String(bucketStart(ts, bucket))
}

function formatDay(ts) {
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}
