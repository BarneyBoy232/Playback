// Rhythms — when listening happens, rather than what was listened to.
//
// All of this is computed on the LISTENER'S LOCAL CLOCK. A play is stored as a
// UTC instant, but "you listen most at 8am" is only meaningful on the clock the
// person was actually looking at.

const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Plays per hour of the day, 0 through 23. Empty hours are kept. */
export function byHour(plays) {
  const buckets = Array.from({ length: 24 }, (_, hour) => ({ hour, label: formatHour(hour), plays: 0, msPlayed: 0 }))
  for (const play of plays) {
    const h = new Date(play.ts).getHours()
    buckets[h].plays++
    buckets[h].msPlayed += play.msPlayed
  }
  return buckets
}

/** Plays per day of the week, Monday first. */
export function byWeekday(plays) {
  const buckets = WEEKDAY_NAMES.map((label, index) => ({ index, label, plays: 0, msPlayed: 0 }))
  for (const play of plays) {
    // getDay() is Sunday-first; shift so Monday is 0.
    const d = (new Date(play.ts).getDay() + 6) % 7
    buckets[d].plays++
    buckets[d].msPlayed += play.msPlayed
  }
  return buckets
}

/** Plays per calendar month, January through December, across every year. */
export function byMonthOfYear(plays) {
  const buckets = MONTH_NAMES.map((label, index) => ({ index, label, plays: 0, msPlayed: 0 }))
  for (const play of plays) {
    const m = new Date(play.ts).getMonth()
    buckets[m].plays++
    buckets[m].msPlayed += play.msPlayed
  }
  return buckets
}

/**
 * The listening clock: a 7 by 24 grid of weekday against hour.
 *
 * This is the single most revealing view in the app. It separates a weekday
 * commute from a Saturday afternoon in a way that neither the hour chart nor
 * the weekday chart can on its own.
 */
export function clock(plays) {
  const grid = []
  for (let day = 0; day < 7; day++) {
    grid.push(
      Array.from({ length: 24 }, (_, hour) => ({
        day,
        hour,
        dayLabel: WEEKDAY_NAMES[day],
        hourLabel: formatHour(hour),
        plays: 0,
        msPlayed: 0,
      })),
    )
  }

  let max = 0
  for (const play of plays) {
    const d = new Date(play.ts)
    const day = (d.getDay() + 6) % 7
    const cell = grid[day][d.getHours()]
    cell.plays++
    cell.msPlayed += play.msPlayed
    if (cell.plays > max) max = cell.plays
  }

  return { grid, max, cells: grid.flat() }
}

/**
 * One cell per local day between two timestamps — the calendar heatmap.
 * Days with nothing on them are included, because an empty stretch is exactly
 * what the heatmap is meant to show.
 */
export function calendar(plays, from, to) {
  const cells = []
  const index = new Map()

  let cursor = new Date(new Date(from).getFullYear(), new Date(from).getMonth(), new Date(from).getDate())
  const end = new Date(to)
  let guard = 0

  while (cursor.getTime() < end.getTime() && guard++ < 4000) {
    const key = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`
    const cell = {
      key,
      ts: cursor.getTime(),
      date: new Date(cursor),
      weekday: (cursor.getDay() + 6) % 7,
      plays: 0,
      msPlayed: 0,
    }
    cells.push(cell)
    index.set(key, cell)
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1)
  }

  let max = 0
  for (const play of plays) {
    const d = new Date(play.ts)
    const cell = index.get(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`)
    if (!cell) continue
    cell.plays++
    cell.msPlayed += play.msPlayed
    if (cell.plays > max) max = cell.plays
  }

  return { cells, max }
}

/** The single busiest hour, weekday and month — the headline facts. */
export function peaks(plays) {
  const hours = byHour(plays)
  const weekdays = byWeekday(plays)
  const months = byMonthOfYear(plays)

  return {
    hour: pickBusiest(hours),
    weekday: pickBusiest(weekdays),
    month: pickBusiest(months),
  }
}

function pickBusiest(buckets) {
  let best = null
  for (const bucket of buckets) {
    if (!best || bucket.plays > best.plays) best = bucket
  }
  return best && best.plays > 0 ? best : null
}

function formatHour(hour) {
  if (hour === 0) return '12am'
  if (hour === 12) return '12pm'
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`
}
