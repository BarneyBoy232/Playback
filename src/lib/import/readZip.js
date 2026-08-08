// Reading the streaming-history files out of a Spotify export zip.
//
// Kept separate from the worker so it can be tested directly — the worker
// itself is then thin glue with nothing clever in it.

import { unzipSync, strFromU8 } from 'fflate'
import { parseExportEntries } from './parseExport.js'

// Spotify names the music files "Streaming_History_Audio_2023-2024_5.json".
// Podcast history lives in "Streaming_History_Video_*" and is not wanted, and
// the rest of the export — playlists, follower lists, inferred interests — has
// no play history in it at all.
export const HISTORY_FILE = /Streaming_History_Audio.*\.json$/i

/**
 * Pull every play out of an export zip.
 *
 * @param {Uint8Array} bytes    The zip file's contents.
 * @param {Function} onProgress Called with a message as each file is read.
 * @returns {{plays: Array, stats: object, entryNames: string[]}}
 */
export function readHistoryZip(bytes, onProgress = () => {}) {
  // Only the history files are decompressed. A full export also contains
  // playlists and listening-preference files, and inflating those would waste
  // memory for nothing.
  const unzipped = unzipSync(bytes, { filter: (entry) => HISTORY_FILE.test(entry.name) })
  const entryNames = Object.keys(unzipped).sort()

  const plays = []
  const stats = { total: 0, music: 0, podcast: 0, invalid: 0, files: 0, skippedFiles: [] }

  let index = 0
  for (const name of entryNames) {
    index++
    onProgress(`Reading ${index} of ${entryNames.length} history files`)
    consumeJson(strFromU8(unzipped[name]), name, plays, stats)
  }

  return { plays, stats, entryNames }
}

/** Parse one streaming-history JSON file into the running totals. */
export function consumeJson(text, name, plays, stats) {
  let json
  try {
    json = JSON.parse(text)
  } catch {
    stats.skippedFiles.push(name)
    return
  }

  if (!Array.isArray(json)) {
    stats.skippedFiles.push(name)
    return
  }

  const parsed = parseExportEntries(json, { source: 'export' })
  plays.push(...parsed.plays)
  stats.total += parsed.stats.total
  stats.music += parsed.stats.music
  stats.podcast += parsed.stats.podcast
  stats.invalid += parsed.stats.invalid
  stats.files++
}
