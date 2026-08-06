// A tiny seeded random number generator.
//
// Why not Math.random()? Because every run would produce different fake data,
// and then a test that says "the top artist should be X" could never be
// written. With a seed, the same seed always produces the exact same history,
// so we can assert on it.

// mulberry32 — small, fast, good enough spread for fake data.
export function makeRng(seed) {
  let a = seed >>> 0
  return function rng() {
    a += 0x6d2b79f5
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Random integer from min to max, both ends included.
export function randInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1))
}

// Pick one item from an array.
export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)]
}

// Pick one index from an array of weights. Heavier weights get picked more.
// Used constantly for artist selection, where "how much do they listen to this
// artist right now" is expressed as a number.
export function weightedIndex(rng, weights) {
  let total = 0
  for (let i = 0; i < weights.length; i++) total += weights[i]
  let roll = rng() * total
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i]
    if (roll <= 0) return i
  }
  return weights.length - 1
}

// A 22-character Spotify-style id, built from the seeded generator so ids are
// stable between runs.
const BASE62 = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
export function makeId(rng) {
  let out = ''
  for (let i = 0; i < 22; i++) out += BASE62[Math.floor(rng() * BASE62.length)]
  return out
}
