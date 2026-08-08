// The switch between demo data and a real Spotify account.
//
// The whole app is built against mock data because no Spotify account is
// available during development. This file is the single seam where that
// decision lives: every other module just asks for "the data source" and gets
// back the same interface either way.

import { addPlays, countPlays, getAllPlays, getMeta, setMeta, clearAll } from './db.js'
import { generateHistory } from './mock/generateHistory.js'
import { buildCatalogue } from './mock/catalogue.js'
import { createMockApi } from './mock/apiFixtures.js'
import { parseExportEntries } from './import/parseExport.js'

export const SOURCE_MOCK = 'mock'
export const SOURCE_SPOTIFY = 'spotify'

const SOURCE_KEY = 'dataSource'

// Fixed so the demo world is identical on every run and every machine.
// generateHistory() derives its catalogue seed from this same number.
export const MOCK_SEED = 20260806

// Bump this whenever the generator changes in a way that alters the data it
// produces. Stored demo data tagged with an older version is thrown away and
// rebuilt, so a stale database can never quietly disagree with the code.
export const MOCK_VERSION = 2

// Kept in memory so the mock catalogue is only generated once per page load.
let mockBundle = null

/**
 * Announce a stage of work, then give the browser a moment to paint it.
 *
 * The pause is skipped when the tab is hidden, and that is not an optimisation
 * — it is a correctness fix. Chrome suspends timers in background tabs, so a
 * plain `setTimeout` yield can simply never fire, leaving the whole rebuild
 * stalled forever on a tab the user has switched away from. There is nothing to
 * paint in a hidden tab anyway, so the yield is pointless there.
 */
async function stage(onProgress, message) {
  onProgress(message)
  if (typeof document !== 'undefined' && document.hidden) return
  await new Promise((resolve) => setTimeout(resolve, 0))
}

export async function getDataSource() {
  return getMeta(SOURCE_KEY, SOURCE_MOCK)
}

export async function setDataSource(source) {
  await setMeta(SOURCE_KEY, source)
}

/**
 * Generate the demo history and load it into the database.
 * Does nothing if the database already holds plays, unless `force` is set.
 *
 * Returns a progress-friendly summary of what happened.
 */
export async function ensureMockData({ force = false, onProgress = () => {} } = {}) {
  // A plain row count is not enough to decide this: an import that was
  // interrupted halfway leaves rows behind but not a usable dataset. The
  // completion flag is only written once the whole load has finished.
  const complete = await getMeta('mockComplete', false)
  const version = await getMeta('mockVersion', 0)
  const existing = await countPlays()
  if (complete && version === MOCK_VERSION && existing > 0 && !force) {
    onProgress('Demo data already loaded')
    return { skipped: true, plays: existing, groundTruth: await getMeta('mockGroundTruth') }
  }

  await stage(onProgress, 'Clearing existing data')
  await clearAll()

  const t0 = performance.now()
  await stage(onProgress, 'Inventing a fake music world')
  const { entries, groundTruth, catalogue } = generateHistory({ seed: MOCK_SEED })

  await stage(onProgress, 'Parsing streaming rows')
  const { plays, stats } = parseExportEntries(entries, { source: 'export' })

  onProgress(`Storing ${plays.length.toLocaleString()} plays`)
  const { added } = await addPlays(plays, (done, total) => {
    onProgress(`Storing ${done.toLocaleString()} of ${total.toLocaleString()} plays`)
  })

  await setMeta(SOURCE_KEY, SOURCE_MOCK)
  await setMeta('mockGroundTruth', groundTruth)
  await setMeta('lastImport', { at: Date.now(), added, stats, elapsedMs: Math.round(performance.now() - t0) })
  await setMeta('mockVersion', MOCK_VERSION)
  // Written last, on purpose: it is what marks the dataset as usable.
  await setMeta('mockComplete', true)

  mockBundle = { catalogue, plays, groundTruth }
  const elapsed = Math.round(performance.now() - t0)

  return { skipped: false, added, stats, groundTruth, elapsedMs: elapsed }
}

/**
 * Get the API client for the current data source.
 * In demo mode this is the fixture client; with a real account it will be the
 * live Spotify client (added in the connection phase).
 */
export async function getApi() {
  const source = await getDataSource()

  if (source === SOURCE_SPOTIFY) {
    const { createSpotifyApi } = await import('./spotify/api.js')
    return createSpotifyApi()
  }

  if (!mockBundle) {
    // Page was reloaded. Rebuild just the catalogue — the seed is fixed, so
    // this reproduces exactly the same fake music world without having to
    // regenerate the whole listening history again.
    const catalogue = buildCatalogue({ seed: MOCK_SEED + 1 })
    const plays = await getAllPlays()
    mockBundle = { catalogue, plays, groundTruth: await getGroundTruth() }
  }

  return createMockApi({
    catalogue: mockBundle.catalogue,
    plays: mockBundle.plays,
    now: Date.now(),
  })
}

/** The patterns deliberately planted in the demo data, for tests and the debug panel. */
export async function getGroundTruth() {
  return getMeta('mockGroundTruth')
}

/**
 * Switch from demo data to a real Spotify account.
 *
 * The demo history is wiped first. Leaving it in place would blend 68,000
 * invented plays into a real listening record, and every number in the app
 * would be fiction dressed up as fact.
 *
 * The freshly issued tokens are the one thing carried across the wipe.
 */
export async function activateSpotify() {
  const tokens = await getMeta('spotifyTokens')
  await clearAll()
  if (tokens) await setMeta('spotifyTokens', tokens)
  await setMeta(SOURCE_KEY, SOURCE_SPOTIFY)
  mockBundle = null
}

/**
 * Wipe everything and return to an empty app.
 *
 * Used when disconnecting an account. It deliberately does NOT fall back to
 * demo data — an app that quietly refills itself with invented plays after you
 * disconnect would be alarming, and worse, indistinguishable from real data at
 * a glance.
 */
export async function resetToEmpty() {
  mockBundle = null
  await clearAll()
  await setMeta(SOURCE_KEY, SOURCE_MOCK)
}
