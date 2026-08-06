// The only file in the app that knows what Spotify's Extended Streaming History
// format looks like. Everything downstream works on our own clean play records,
// so if Spotify ever changes their export format, this is the single place that
// needs updating.
//
// A raw export row looks like this:
// {
//   "ts": "2024-03-15T08:14:22Z",
//   "platform": "android",
//   "ms_played": 187000,
//   "conn_country": "AU",
//   "master_metadata_track_name": "Overpass",
//   "master_metadata_album_artist_name": "Velvet Harbour",
//   "master_metadata_album_album_name": "Low Tide",
//   "spotify_track_uri": "spotify:track:...",
//   "episode_name": null,
//   "reason_start": "clickrow",
//   "reason_end": "trackdone",
//   "shuffle": false, "skipped": false, "offline": false
// }

// A play counts as "skipped" if Spotify said so, or if the user hit next before
// the 30 second mark. Older exports leave the skipped field null, so the second
// check is what makes skip statistics work across every export version.
const SKIP_THRESHOLD_MS = 30000

/**
 * Turn raw export rows into clean play records.
 *
 * @param {Array} rawEntries Rows straight out of a Streaming_History_Audio file.
 * @param {object} opts
 * @param {'export'|'live'} opts.source Where these rows came from.
 * @returns {{plays: Array, stats: object}}
 */
export function parseExportEntries(rawEntries, { source = 'export' } = {}) {
  const plays = []
  const stats = { total: 0, music: 0, podcast: 0, invalid: 0 }

  for (const raw of rawEntries) {
    stats.total++

    // Podcasts and audiobooks come through the same file. They are excluded on
    // purpose: a single 90 minute episode would outrank an entire year of songs
    // on any "most listened" chart.
    if (raw.episode_name != null || raw.spotify_episode_uri != null) {
      stats.podcast++
      continue
    }

    const trackUri = raw.spotify_track_uri
    const trackName = raw.master_metadata_track_name
    if (!trackUri || !trackName || !raw.ts) {
      stats.invalid++
      continue
    }

    const ts = Date.parse(raw.ts)
    if (Number.isNaN(ts)) {
      stats.invalid++
      continue
    }

    const msPlayed = Number(raw.ms_played) || 0
    const reasonEnd = raw.reason_end || null

    plays.push({
      // Dedupe key. The same play arriving twice — once from the lifetime
      // export, once from live polling — collapses to a single row.
      key: `${ts}|${trackUri}`,
      ts,
      msPlayed,
      trackUri,
      trackName,
      artistName: raw.master_metadata_album_artist_name || 'Unknown Artist',
      albumName: raw.master_metadata_album_album_name || 'Unknown Album',
      reasonStart: raw.reason_start || null,
      reasonEnd,
      shuffle: raw.shuffle === true,
      skipped: raw.skipped === true || (reasonEnd === 'fwdbtn' && msPlayed < SKIP_THRESHOLD_MS),
      offline: raw.offline === true,
      platform: normalisePlatform(raw.platform),
      country: raw.conn_country || null,
      source,
    })
    stats.music++
  }

  return { plays, stats }
}

// Spotify's platform strings are messy and inconsistent — "Android OS 13 API 33
// (Google, Pixel 7)", "Windows 10 (10.0.19044; x64)", "iOS 17.2 (iPhone14,5)".
// Collapse them to something a chart can use.
export function normalisePlatform(platform) {
  if (!platform) return 'unknown'
  const p = String(platform).toLowerCase()
  if (p.includes('android')) return 'android'
  if (p.includes('ios') || p.includes('iphone') || p.includes('ipad')) return 'ios'
  if (p.includes('windows')) return 'windows'
  if (p.includes('os x') || p.includes('macos') || p.includes('mac')) return 'mac'
  if (p.includes('linux')) return 'linux'
  if (p.includes('web')) return 'web'
  if (p.includes('cast') || p.includes('chromecast')) return 'cast'
  if (p.includes('partner') || p.includes('sonos') || p.includes('playstation')) return 'device'
  return p.split(/[\s(]/)[0] || 'unknown'
}

/**
 * Read one or more files the user dropped in and parse every streaming-history
 * JSON inside them. Handles the individual JSON files; the zip case is added in
 * the import phase.
 */
export async function parseHistoryFiles(files) {
  const allPlays = []
  const combined = { total: 0, music: 0, podcast: 0, invalid: 0, files: 0 }

  for (const file of files) {
    if (!file.name.toLowerCase().endsWith('.json')) continue
    const text = await file.text()
    let json
    try {
      json = JSON.parse(text)
    } catch {
      continue
    }
    if (!Array.isArray(json)) continue

    const { plays, stats } = parseExportEntries(json, { source: 'export' })
    allPlays.push(...plays)
    combined.total += stats.total
    combined.music += stats.music
    combined.podcast += stats.podcast
    combined.invalid += stats.invalid
    combined.files++
  }

  return { plays: allPlays, stats: combined }
}
