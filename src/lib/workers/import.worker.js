// Reads a Spotify data export and turns it into play records.
//
// This runs in a Web Worker because a lifetime export can hold hundreds of
// thousands of plays. Unzipping and parsing that on the main thread would lock
// the page up for several seconds — no scrolling, no progress, nothing moving.
// Out here it can take as long as it needs to.
//
// All the real work lives in lib/import/readZip.js so it can be tested without
// a browser. This file is only the plumbing between the page and that code.

import { readHistoryZip, consumeJson } from '../import/readZip.js'

self.onmessage = async (event) => {
  const { files } = event.data

  try {
    const plays = []
    const stats = { total: 0, music: 0, podcast: 0, invalid: 0, files: 0, skippedFiles: [] }

    for (const file of files) {
      const name = file.name || 'file'
      const lower = name.toLowerCase()

      if (lower.endsWith('.zip')) {
        post('progress', `Opening ${name}`)
        const bytes = new Uint8Array(await file.arrayBuffer())
        const result = readHistoryZip(bytes, (message) => post('progress', message))

        if (!result.entryNames.length) {
          stats.skippedFiles.push(name)
          post('progress', `No streaming history inside ${name}`)
          continue
        }

        plays.push(...result.plays)
        stats.total += result.stats.total
        stats.music += result.stats.music
        stats.podcast += result.stats.podcast
        stats.invalid += result.stats.invalid
        stats.files += result.stats.files
        stats.skippedFiles.push(...result.stats.skippedFiles)
      } else if (lower.endsWith('.json')) {
        post('progress', `Reading ${name}`)
        consumeJson(await file.text(), name, plays, stats)
      } else {
        stats.skippedFiles.push(name)
      }
    }

    post('progress', `Sorting ${plays.length.toLocaleString()} plays`)
    plays.sort((a, b) => a.ts - b.ts)

    self.postMessage({ type: 'done', plays, stats })
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message })
  }
}

function post(type, message) {
  self.postMessage({ type, message })
}
