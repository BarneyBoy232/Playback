// The local database. Everything lives in the browser via IndexedDB — no
// server, no account, no cost. Dexie is a thin wrapper that makes IndexedDB
// bearable to work with.
//
// Plays are stored in MONTHLY CHUNKS rather than one row per play. A first
// version stored each play as its own row and writing a lifetime of history
// took minutes: IndexedDB charges a fixed cost per row, and there are tens of
// thousands of them. One row per month turns ~68,000 writes into ~50, which is
// instant.
//
// This suits how the app works anyway — every statistic is computed in memory
// over the whole play array, so nothing needs per-play row lookups.

import Dexie from 'dexie'

export const db = new Dexie('listening-tracker')

db.version(3).stores({
  // month is 'YYYY-MM'; each row holds { month, plays: [...] }.
  playChunks: '&month',

  // Lightweight summary of each chunk so counts and date ranges can be read
  // without loading every play into memory.
  chunkIndex: '&month, count',

  // Metadata caches, filled in from the live Spotify API once connected.
  tracks: '&uri, name, artistName, albumId',
  artists: '&id, name',
  albums: '&id, name, releaseDate',

  // Dated captures of Spotify's own top-tracks / top-artists lists, so their
  // rankings can be compared against ours.
  snapshots: '++id, capturedAt, type, range',

  // Tokens, last poll time, import log — anything that is a single value.
  meta: '&key',
})

/** 'YYYY-MM' for a timestamp, in UTC so chunk boundaries never shift. */
export function monthKey(ts) {
  const d = new Date(ts)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * Insert plays, merging with whatever is already stored.
 *
 * De-duplication happens on the play's `key` (timestamp + track), so the same
 * play arriving twice — once from the lifetime export, once from live polling —
 * collapses into one. Re-importing the same file adds nothing.
 *
 * Returns how many plays were genuinely new.
 */
export async function addPlays(plays, onProgress = null) {
  if (!plays.length) return { added: 0, duplicates: 0 }

  // Group the incoming plays by the month they belong to.
  const byMonth = new Map()
  for (const play of plays) {
    const month = monthKey(play.ts)
    let bucket = byMonth.get(month)
    if (!bucket) {
      bucket = []
      byMonth.set(month, bucket)
    }
    bucket.push(play)
  }

  const months = [...byMonth.keys()].sort()
  let added = 0
  let done = 0

  await db.transaction('rw', db.playChunks, db.chunkIndex, async () => {
    for (const month of months) {
      const incoming = byMonth.get(month)
      const existing = await db.playChunks.get(month)

      // A Map keyed on the play key is what actually performs the de-duplication.
      const merged = new Map()
      if (existing) for (const p of existing.plays) merged.set(p.key, p)
      const before = merged.size
      for (const p of incoming) merged.set(p.key, p)

      const list = [...merged.values()].sort((a, b) => a.ts - b.ts)
      added += merged.size - before

      await db.playChunks.put({ month, plays: list })
      await db.chunkIndex.put({
        month,
        count: list.length,
        minTs: list[0].ts,
        maxTs: list[list.length - 1].ts,
      })

      done += incoming.length
      if (onProgress) onProgress(done, plays.length)
    }
  })

  return { added, duplicates: plays.length - added }
}

/** Every play, oldest first. This is what the statistics engine works on. */
export async function getAllPlays() {
  const chunks = await db.playChunks.toArray()
  chunks.sort((a, b) => (a.month < b.month ? -1 : 1))
  const out = []
  for (const chunk of chunks) out.push(...chunk.plays)
  return out
}

/** Plays between two timestamps (epoch ms), inclusive of `from`, exclusive of `to`. */
export async function getPlaysInRange(from, to) {
  const chunks = await db.playChunks.toArray()
  chunks.sort((a, b) => (a.month < b.month ? -1 : 1))
  const out = []
  for (const chunk of chunks) {
    for (const play of chunk.plays) {
      if (play.ts >= from && play.ts < to) out.push(play)
    }
  }
  return out
}

/** Oldest and newest play timestamps, or null if nothing is stored. */
export async function getPlayRange() {
  const index = await db.chunkIndex.toArray()
  if (!index.length) return null
  let from = Infinity
  let to = -Infinity
  for (const row of index) {
    if (row.minTs < from) from = row.minTs
    if (row.maxTs > to) to = row.maxTs
  }
  return { from, to }
}

/** Total plays stored — read from the summary table, so it stays cheap. */
export async function countPlays() {
  const index = await db.chunkIndex.toArray()
  return index.reduce((sum, row) => sum + row.count, 0)
}

export async function getMeta(key, fallback = null) {
  const row = await db.meta.get(key)
  return row ? row.value : fallback
}

export async function setMeta(key, value) {
  await db.meta.put({ key, value })
}

/** Wipe everything. Used when switching between demo data and a real account. */
export async function clearAll() {
  await db.transaction(
    'rw',
    db.playChunks,
    db.chunkIndex,
    db.tracks,
    db.artists,
    db.albums,
    db.snapshots,
    db.meta,
    async () => {
      await Promise.all([
        db.playChunks.clear(),
        db.chunkIndex.clear(),
        db.tracks.clear(),
        db.artists.clear(),
        db.albums.clear(),
        db.snapshots.clear(),
        db.meta.clear(),
      ])
    },
  )
}
