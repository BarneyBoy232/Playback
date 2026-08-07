// One entry point that turns a set of plays into everything the dashboard
// shows. The worker calls this; nothing else needs to know which module a
// particular statistic lives in.

import { filterPlays, bucketPlays } from './window.js'
import { topTracks, topArtists, topAlbums, topGenres, totals } from './leaderboards.js'
import { byHour, byWeekday, byMonthOfYear, clock, calendar, peaks } from './rhythms.js'
import { buildSessions, sessionStats, listeningStreaks, longestRepeat, longestArtistStreak } from './sessions.js'
import { habits, skipByArtist, breakdowns, discoveryByMonth, abandoned, playedOnce, timeLockedTracks, bingeDays } from './behaviour.js'
import { byYear, artistOfEachYear, onThisDay, comparePeriods } from './compare.js'

export * from './window.js'
export * from './leaderboards.js'
export * from './rhythms.js'
export * from './sessions.js'
export * from './behaviour.js'
export * from './compare.js'

/**
 * Compute the whole dashboard for one time window.
 *
 * @param {Array} allPlays          Every play stored, oldest first.
 * @param {object} win              Output of resolveWindow().
 * @param {Map} opts.genresByArtist Artist name to genre list, if known.
 * @param {number} opts.today       The day "on this day" should look at.
 */
export function computeDashboard(allPlays, win, { genresByArtist = null, today = null, leaderboardLimit = 50 } = {}) {
  const inWindow = filterPlays(allPlays, win.from, win.to)
  const previous = win.previous ? filterPlays(allPlays, win.previous.from, win.previous.to) : []

  const sessions = buildSessions(inWindow)

  return {
    window: { id: win.id, label: win.label, from: win.from, to: win.to, bucket: win.bucket },

    totals: totals(inWindow),
    trend: bucketPlays(inWindow, win.from, win.to, win.bucket),

    leaderboards: {
      tracks: topTracks(inWindow, { limit: leaderboardLimit }),
      artists: topArtists(inWindow, { limit: leaderboardLimit }),
      albums: topAlbums(inWindow, { limit: leaderboardLimit }),
      genres: topGenres(inWindow, genresByArtist, { limit: 20 }),
      // Time and play count disagree often enough to be worth showing both.
      tracksByTime: topTracks(inWindow, { limit: leaderboardLimit, sortBy: 'time' }),
      artistsByTime: topArtists(inWindow, { limit: leaderboardLimit, sortBy: 'time' }),
    },

    rhythms: {
      hour: byHour(inWindow),
      weekday: byWeekday(inWindow),
      monthOfYear: byMonthOfYear(inWindow),
      clock: clock(inWindow),
      calendar: calendar(inWindow, win.from, win.to),
      peaks: peaks(inWindow),
    },

    sessions: {
      ...sessionStats(sessions),
      streaks: listeningStreaks(inWindow),
      longestRepeat: longestRepeat(inWindow),
      longestArtistStreak: longestArtistStreak(inWindow),
    },

    behaviour: {
      habits: habits(inWindow),
      mostSkipped: skipByArtist(inWindow, { mostSkipped: true }),
      leastSkipped: skipByArtist(inWindow, { mostSkipped: false }),
      breakdowns: breakdowns(inWindow),
      discovery: discoveryByMonth(inWindow),
      // Abandonment and one-off plays are judged against the WHOLE history, not
      // the window. An artist is not abandoned just because they are missing
      // from the last 30 days.
      abandoned: abandoned(allPlays),
      playedOnce: playedOnce(inWindow),
      timeLocked: timeLockedTracks(inWindow),
      bingeDays: bingeDays(inWindow),
    },

    compare: {
      years: byYear(allPlays),
      artistOfEachYear: artistOfEachYear(allPlays),
      onThisDay: onThisDay(allPlays, today || win.to),
      versusPrevious: previous.length ? comparePeriods(inWindow, previous) : null,
    },
  }
}
