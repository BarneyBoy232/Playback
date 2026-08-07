import { describe, it, expect, beforeAll } from 'vitest'
import { generateHistory } from '../mock/generateHistory.js'
import { parseExportEntries } from '../import/parseExport.js'
import { topArtists, topTracks, totals } from './leaderboards.js'
import { byHour, calendar } from './rhythms.js'
import { abandoned } from './behaviour.js'
import { byYear } from './compare.js'
import { resolveWindow, filterPlays } from './window.js'

// The real test of a statistics engine is not whether its numbers look
// plausible — it is whether it can independently rediscover facts that were
// deliberately planted in the data.
//
// The generator knows what it built: which song is genuinely the most played,
// which artists were dropped after the first year, which artists were obsessed
// over for a fortnight. None of that is passed to the engine. It has to find it.

describe('rediscovering planted facts in the demo data', () => {
  let plays
  let truth
  let parseStats

  beforeAll(() => {
    const { entries, groundTruth } = generateHistory()
    const parsed = parseExportEntries(entries, { source: 'export' })
    plays = parsed.plays
    parseStats = parsed.stats
    truth = groundTruth
  }, 30000)

  it('keeps every music play and drops every podcast', () => {
    expect(parseStats.music).toBe(truth.musicPlays)
    expect(parseStats.podcast).toBe(truth.podcastPlays)
    expect(plays).toHaveLength(truth.musicPlays)
  })

  it('agrees with the generator on the totals', () => {
    const t = totals(plays)
    expect(t.plays).toBe(truth.musicPlays)
    expect(t.msPlayed).toBe(truth.totalMsPlayed)
    expect(t.tracks).toBe(truth.uniqueTracks)
    expect(t.artists).toBe(truth.uniqueArtists)
  })

  it('finds the most played artist without being told', () => {
    const found = topArtists(plays, { limit: 1 })[0]
    expect(found.name).toBe(truth.topArtistByPlays.name)
    expect(found.plays).toBe(truth.topArtistByPlays.plays)
  })

  it('finds the artist given the most hours, which can be a different one', () => {
    const found = topArtists(plays, { limit: 1, sortBy: 'time' })[0]
    expect(found.name).toBe(truth.topArtistByTime.name)
    expect(found.msPlayed).toBe(truth.topArtistByTime.msPlayed)
  })

  it('finds the most played song', () => {
    const found = topTracks(plays, { limit: 1 })[0]
    expect(found.key).toBe(truth.topTrack.uri)
    expect(found.plays).toBe(truth.topTrack.plays)
  })

  it('detects the artists that were dropped after the first year', () => {
    const detected = abandoned(plays, { minPlays: 40, silentDays: 180, limit: 100 }).map((row) => row.name)
    const planted = truth.abandonedArtists

    // Every planted artist should be caught. They were played heavily for the
    // first quarter of the timeline and then never again.
    const missed = planted.filter((name) => !detected.includes(name))
    expect(missed).toEqual([])
  })

  it('sees each fortnight obsession as a spike against the weeks before it', () => {
    for (const burst of truth.burstArtists) {
      const start = Date.parse(burst.startTs)
      const end = Date.parse(burst.endTs)
      const span = end - start

      const during = plays.filter((p) => p.artistName === burst.name && p.ts >= start && p.ts < end).length
      const before = plays.filter((p) => p.artistName === burst.name && p.ts >= start - span && p.ts < start).length

      // The burst multiplies that artist's weight roughly tenfold, so the
      // fortnight should comfortably beat the fortnight before it.
      expect(during).toBeGreaterThan(before)
    }
  })

  it('reproduces the injected daily rhythm rather than a flat distribution', () => {
    const hours = byHour(plays)
    const quietest = hours[4].plays // pre-dawn trough
    const morning = hours[8].plays // commute peak
    const evening = hours[18].plays // evening peak

    expect(morning).toBeGreaterThan(quietest * 5)
    expect(evening).toBeGreaterThan(quietest * 5)
  })

  it('loses nothing when the history is split by year', () => {
    const years = byYear(plays)
    const summed = years.reduce((sum, y) => sum + y.plays, 0)
    expect(summed).toBe(plays.length)
  })

  it('loses nothing when the history is split into windows', () => {
    // Every play must fall into exactly one window, with no gaps and no overlap.
    const first = plays[0].ts
    const last = plays[plays.length - 1].ts
    const quarter = Math.ceil((last - first) / 4)

    let counted = 0
    for (let i = 0; i < 4; i++) {
      const from = first + i * quarter
      // Windows exclude their end, so the last one has to reach past the final
      // play rather than stop exactly on it.
      const to = i === 3 ? last + 1 : first + (i + 1) * quarter
      counted += filterPlays(plays, from, to).length
    }
    expect(counted).toBe(plays.length)
  })

  it('puts every play on a calendar day and none outside the range', () => {
    const win = resolveWindow('all', {
      now: plays[plays.length - 1].ts + 1,
      dataRange: { from: plays[0].ts, to: plays[plays.length - 1].ts },
    })
    const cal = calendar(plays, win.from, win.to)
    const onCalendar = cal.cells.reduce((sum, cell) => sum + cell.plays, 0)
    expect(onCalendar).toBe(plays.length)
  })
})
