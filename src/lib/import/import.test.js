import { describe, it, expect } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { readHistoryZip } from './readZip.js'
import { parseExportEntries } from './parseExport.js'

// A synthetic export built to Spotify's exact format, including the awkward
// parts of real files: podcast rows mixed in with music, rows where the track
// name is null, and older exports where the `skipped` field does not exist.

function musicRow(overrides = {}) {
  return {
    ts: '2024-03-15T08:14:22Z',
    platform: 'Android OS 13 API 33 (Google, Pixel 7)',
    ms_played: 187000,
    conn_country: 'AU',
    master_metadata_track_name: 'Overpass',
    master_metadata_album_artist_name: 'Velvet Harbour',
    master_metadata_album_album_name: 'Low Tide',
    spotify_track_uri: 'spotify:track:aaaaaaaaaaaaaaaaaaaaaa',
    episode_name: null,
    episode_show_name: null,
    spotify_episode_uri: null,
    reason_start: 'clickrow',
    reason_end: 'trackdone',
    shuffle: false,
    skipped: false,
    offline: false,
    offline_timestamp: null,
    incognito_mode: false,
    ...overrides,
  }
}

function podcastRow() {
  return {
    ts: '2024-03-15T09:00:00Z',
    platform: 'windows',
    ms_played: 2400000,
    conn_country: 'AU',
    master_metadata_track_name: null,
    master_metadata_album_artist_name: null,
    master_metadata_album_album_name: null,
    spotify_track_uri: null,
    episode_name: 'The Siege of Malta',
    episode_show_name: 'The Rest Is History',
    spotify_episode_uri: 'spotify:episode:bbbbbbbbbbbbbbbbbbbbbb',
    reason_start: 'clickrow',
    reason_end: 'endplay',
    shuffle: false,
    skipped: false,
    offline: false,
    offline_timestamp: null,
    incognito_mode: false,
  }
}

describe('parsing an export file', () => {
  it('keeps music and drops podcasts', () => {
    const { plays, stats } = parseExportEntries([musicRow(), podcastRow(), musicRow()])
    expect(plays).toHaveLength(2)
    expect(stats.podcast).toBe(1)
    expect(stats.music).toBe(2)
  })

  it('tidies Spotify\'s messy platform strings into something chartable', () => {
    const cases = [
      ['Android OS 13 API 33 (Google, Pixel 7)', 'android'],
      ['Windows 10 (10.0.19044; x64)', 'windows'],
      ['iOS 17.2 (iPhone14,5)', 'ios'],
      ['web_player https://open.spotify.com', 'web'],
    ]
    for (const [raw, expected] of cases) {
      const { plays } = parseExportEntries([musicRow({ platform: raw })])
      expect(plays[0].platform).toBe(expected)
    }
  })

  it('works out skips itself when the export does not record them', () => {
    // Older exports have no `skipped` field. A track cut short with the next
    // button is still a skip and must be counted as one.
    const older = musicRow({ skipped: null, reason_end: 'fwdbtn', ms_played: 4000 })
    const { plays } = parseExportEntries([older])
    expect(plays[0].skipped).toBe(true)
  })

  it('does not call a long listen a skip just because the next button was used', () => {
    const late = musicRow({ skipped: null, reason_end: 'fwdbtn', ms_played: 200000 })
    const { plays } = parseExportEntries([late])
    expect(plays[0].skipped).toBe(false)
  })

  it('throws away rows with no track or no timestamp instead of storing junk', () => {
    const { plays, stats } = parseExportEntries([
      musicRow({ spotify_track_uri: null }),
      musicRow({ ts: 'not a date' }),
      musicRow(),
    ])
    expect(plays).toHaveLength(1)
    expect(stats.invalid).toBe(2)
  })

  it('gives every play a key that is unique to that moment and track', () => {
    const { plays } = parseExportEntries([
      musicRow({ ts: '2024-03-15T08:14:22Z' }),
      musicRow({ ts: '2024-03-15T08:20:00Z' }),
    ])
    expect(plays[0].key).not.toBe(plays[1].key)
  })
})

describe('reading a real export zip', () => {
  function buildZip() {
    const music = Array.from({ length: 40 }, (_, i) =>
      musicRow({
        ts: `2024-03-${String((i % 28) + 1).padStart(2, '0')}T08:14:22Z`,
        spotify_track_uri: `spotify:track:track${String(i).padStart(16, '0')}`,
      }),
    )

    return zipSync({
      'Spotify Extended Streaming History/Streaming_History_Audio_2023-2024_0.json': strToU8(
        JSON.stringify(music.slice(0, 20)),
      ),
      'Spotify Extended Streaming History/Streaming_History_Audio_2024_1.json': strToU8(
        JSON.stringify([...music.slice(20), podcastRow()]),
      ),
      // Files that exist in a real export and must be ignored.
      'Spotify Extended Streaming History/Streaming_History_Video_2024.json': strToU8(
        JSON.stringify([podcastRow()]),
      ),
      'Spotify Extended Streaming History/ReadMeFirst_ExtendedStreamingHistory.pdf': strToU8('not json'),
      'Spotify Account Data/Playlist1.json': strToU8(JSON.stringify({ playlists: [] })),
    })
  }

  it('finds only the audio history files inside the zip', () => {
    const { entryNames } = readHistoryZip(buildZip())
    expect(entryNames).toHaveLength(2)
    expect(entryNames.every((name) => name.includes('Streaming_History_Audio'))).toBe(true)
  })

  it('reads every play across multiple files', () => {
    const { plays, stats } = readHistoryZip(buildZip())
    expect(plays).toHaveLength(40)
    expect(stats.files).toBe(2)
    expect(stats.podcast).toBe(1)
  })

  it('reports progress once per history file', () => {
    const messages = []
    readHistoryZip(buildZip(), (message) => messages.push(message))
    expect(messages).toHaveLength(2)
  })

  it('returns nothing rather than throwing when the zip is the wrong download', () => {
    const wrongZip = zipSync({
      'Spotify Account Data/Userdata.json': strToU8(JSON.stringify({ username: 'someone' })),
    })
    const { plays, entryNames } = readHistoryZip(wrongZip)
    expect(entryNames).toHaveLength(0)
    expect(plays).toHaveLength(0)
  })

  it('produces identical keys on a second read, so re-importing adds nothing', () => {
    const first = readHistoryZip(buildZip()).plays.map((p) => p.key)
    const second = readHistoryZip(buildZip()).plays.map((p) => p.key)
    expect(new Set([...first, ...second]).size).toBe(first.length)
  })
})
