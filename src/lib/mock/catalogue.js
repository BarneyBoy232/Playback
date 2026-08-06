// Builds a deterministic fake music catalogue — artists, their albums, and the
// tracks on those albums.
//
// This exists because there is no Spotify account available during
// development. Everything in the app is built and tested against this
// catalogue, and it is shaped like real music data (artists have genres, albums
// have release dates, tracks have durations) so nothing has to change when real
// data arrives.

import { makeRng, randInt, pick, makeId } from './rng.js'

const ADJECTIVES = [
  'Velvet', 'Neon', 'Paper', 'Silent', 'Golden', 'Hollow', 'Electric', 'Wild',
  'Crimson', 'Lonely', 'Broken', 'Midnight', 'Glass', 'Iron', 'Soft', 'Wandering',
  'Distant', 'Bitter', 'Sacred', 'Frozen', 'Restless', 'Quiet', 'Burning', 'Pale',
  'Endless', 'Hungry', 'Static', 'Marble', 'Feral', 'Vacant',
]

const NOUNS = [
  'Harbour', 'Ghost', 'Machine', 'Garden', 'Signal', 'Orchid', 'Tide', 'Lantern',
  'Fever', 'Cathedral', 'Wolves', 'Circuit', 'Mirror', 'Anchor', 'Sparrow', 'Ember',
  'Alibi', 'Parade', 'Hollow', 'Compass', 'Sermon', 'Riot', 'Bloom', 'Static',
  'Vessel', 'Chapel', 'Halo', 'Rust', 'Prairie', 'Monsoon', 'Atlas', 'Cinder',
]

const SOLO_FIRST = [
  'Ada', 'Milo', 'Sasha', 'Rhea', 'Cole', 'Imogen', 'Theo', 'Nadia', 'Owen',
  'Juno', 'Elias', 'Marlow', 'Sena', 'Kit', 'Vera', 'Dez', 'Lila', 'Roan',
]

const SOLO_LAST = [
  'Vance', 'Okonkwo', 'Halloran', 'Reyes', 'Ashworth', 'Kimura', 'Delacroix',
  'Byrne', 'Nakamura', 'Sorensen', 'Ibarra', 'Whitlock', 'Farrow', 'Adeyemi',
]

const ALBUM_WORDS = [
  'After Hours', 'Low Tide', 'Common Ground', 'The Long Way', 'Sleepwalk',
  'Second Language', 'Nothing Serious', 'Cold Open', 'Home Video', 'Blue Season',
  'Loose Ends', 'Faultlines', 'Slow Burn', 'Room Tone', 'Night Shift',
  'Perfect Weather', 'Small Hours', 'Every Exit', 'Paper Radio', 'Undertow',
  'Hindsight', 'Open Water', 'Static Bloom', 'Late Reply', 'Half Light',
]

const TRACK_WORDS = [
  'Overpass', 'Telephone', 'Backseat', 'Weekender', 'Saltwater', 'Dial Tone',
  'Bad Weather', 'Hometown', 'Long Distance', 'Doorframe', 'Coastline', 'Handwriting',
  'Afterglow', 'Cheap Seats', 'Slow Dance', 'Blue Hour', 'Motorway', 'Kitchen Light',
  'Foreign Film', 'Second Wind', 'Paperweight', 'Radio Silence', 'Loose Change',
  'Winter Coat', 'Empty Pool', 'Bright Side', 'Last Call', 'Sunday Driver',
  'Borrowed Time', 'Quiet Part', 'Open Window', 'Cardboard', 'Neon Sign',
  'Front Porch', 'Ferry Ride', 'Streetlight', 'Old Habit', 'Fault Line',
]

const GENRES = [
  'indie rock', 'bedroom pop', 'alt r&b', 'dream pop', 'shoegaze', 'folk',
  'synthpop', 'post-punk', 'ambient', 'jazz fusion', 'neo-soul', 'lo-fi hip hop',
  'garage rock', 'electronica', 'art pop', 'americana', 'trip hop', 'house',
  'psych rock', 'chamber pop', 'drum and bass', 'soul', 'punk', 'techno',
]

function makeArtistName(rng, used) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const style = rng()
    let name
    if (style < 0.45) name = `${pick(rng, ADJECTIVES)} ${pick(rng, NOUNS)}`
    else if (style < 0.7) name = `The ${pick(rng, NOUNS)}`
    else if (style < 0.9) name = `${pick(rng, SOLO_FIRST)} ${pick(rng, SOLO_LAST)}`
    else name = pick(rng, NOUNS)
    if (!used.has(name)) {
      used.add(name)
      return name
    }
  }
  // Fallback so generation can never get stuck.
  const fallback = `${pick(rng, ADJECTIVES)} ${pick(rng, NOUNS)} ${used.size}`
  used.add(fallback)
  return fallback
}

/**
 * Build the catalogue.
 *
 * @param {object} opts
 * @param {number} opts.seed        Same seed = same catalogue, every time.
 * @param {number} opts.artistCount How many artists to invent.
 * @returns {{artists: Array, tracksByUri: Map, allTracks: Array}}
 */
export function buildCatalogue({ seed = 1234, artistCount = 800 } = {}) {
  const rng = makeRng(seed)
  const usedNames = new Set()
  const usedAlbumTitles = new Set()
  const artists = []
  const allTracks = []
  const tracksByUri = new Map()

  for (let a = 0; a < artistCount; a++) {
    const name = makeArtistName(rng, usedNames)
    const id = makeId(rng)

    // One to three genres per artist, which is roughly how Spotify tags them.
    const genreCount = randInt(rng, 1, 3)
    const genres = []
    while (genres.length < genreCount) {
      const g = pick(rng, GENRES)
      if (!genres.includes(g)) genres.push(g)
    }

    const albumCount = randInt(rng, 1, 4)
    const albums = []
    const artistTracks = []

    for (let b = 0; b < albumCount; b++) {
      let title = pick(rng, ALBUM_WORDS)
      // Albums share a small title pool, so disambiguate collisions.
      let guard = 0
      while (usedAlbumTitles.has(`${name}::${title}`) && guard++ < 10) {
        title = pick(rng, ALBUM_WORDS)
      }
      usedAlbumTitles.add(`${name}::${title}`)

      const albumId = makeId(rng)
      const releaseYear = randInt(rng, 2008, 2026)
      const releaseDate = `${releaseYear}-${String(randInt(rng, 1, 12)).padStart(2, '0')}-${String(randInt(rng, 1, 28)).padStart(2, '0')}`
      const trackCount = randInt(rng, 6, 13)
      const trackUris = []

      for (let t = 0; t < trackCount; t++) {
        const trackName = rng() < 0.25
          ? `${pick(rng, TRACK_WORDS)} (${pick(rng, ['Reprise', 'Alt Version', 'Interlude', 'Live'])})`
          : pick(rng, TRACK_WORDS)
        const uri = `spotify:track:${makeId(rng)}`
        const track = {
          uri,
          name: trackName,
          artistName: name,
          artistId: id,
          albumName: title,
          albumId,
          // Most songs sit between 2 and 5 minutes.
          durationMs: randInt(rng, 108, 312) * 1000,
          popularity: randInt(rng, 0, 100),
          explicit: rng() < 0.18,
          trackNumber: t + 1,
        }
        allTracks.push(track)
        artistTracks.push(track)
        tracksByUri.set(uri, track)
        trackUris.push(uri)
      }

      albums.push({ id: albumId, name: title, releaseDate, trackUris, artistName: name })
    }

    artists.push({
      id,
      name,
      genres,
      popularity: randInt(rng, 5, 95),
      albums,
      tracks: artistTracks,
    })
  }

  return { artists, allTracks, tracksByUri }
}
