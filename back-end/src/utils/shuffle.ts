/**
 * Seeded shuffle utility — deterministic shuffle based on a string seed.
 * Uses a simple LCG (Linear Congruential Generator) for reproducibility.
 * Each candidate's attempt ID serves as the seed, so:
 *  - Different candidates get different question/option orders
 *  - The same candidate gets the same order on re-fetch (consistent within an attempt)
 */

function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

function seededRandom(seed: string): () => number {
  let state = hashSeed(seed) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) % 0xffffffff;
    return state / 0xffffffff;
  };
}

/**
 * Fisher-Yates shuffle with a seeded RNG.
 * Returns a new array (does not mutate the input).
 */
export function seededShuffle<T>(array: T[], seed: string): T[] {
  const rng = seededRandom(seed);
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
