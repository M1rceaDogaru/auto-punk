// Deterministic d10 pool roller for Cyberpunk 2020-style skill tests.
// Dice are rolled here by the rules engine — never invented by the LLM.

export interface RNG {
  /** Inclusive random integer in [min, max]. */
  nextInt(min: number, max: number): number;
}

/** Small, fast, seedable PRNG (mulberry32). Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Crypto-backed RNG for production rolls. */
function cryptoRng(): RNG {
  const buf = new Uint32Array(1);
  return {
    nextInt(min: number, max: number): number {
      const range = max - min + 1;
      // Rejection sampling to avoid modulo bias.
      const limit = Math.floor(0x1_0000_0000 / range) * range;
      let x: number;
      do {
        globalThis.crypto.getRandomValues(buf);
        x = buf[0];
      } while (x >= limit);
      return min + (x % range);
    },
  };
}

/** Seeded when `seed` is provided (deterministic, for tests), else crypto-backed. */
export function createRng(seed?: number): RNG {
  if (seed === undefined) return cryptoRng();
  const next = mulberry32(seed);
  return {
    nextInt(min: number, max: number): number {
      return min + Math.floor(next() * (max - min + 1));
    },
  };
}

export interface DiceRollResult {
  label: string;
  pool: number;
  /** Individual d10 results. */
  dice: number[];
  /** Count of dice showing 5 or higher. */
  successes: number;
  /** True if any die showed a 1 (automatic failure in CP2020). */
  fumble: boolean;
  /** Sum of all dice, for reference / tiebreaks. */
  total: number;
}

/**
 * Roll a pool of d10s. A test succeeds when there is at least one success and no fumble.
 */
export function rollD10Pool(pool: number, label = 'roll', rng: RNG = createRng()): DiceRollResult {
  const n = Math.max(0, Math.floor(pool));
  const dice: number[] = [];
  for (let i = 0; i < n; i++) dice.push(rng.nextInt(1, 10));

  let successes = 0;
  let total = 0;
  let fumble = false;
  for (const d of dice) {
    total += d;
    if (d >= 5) successes++;
    if (d === 1) fumble = true;
  }

  return { label, pool: n, dice, successes, fumble, total };
}

/** A roll "succeeds" when it has at least one success and no fumble. */
export function rollSucceeded(result: DiceRollResult): boolean {
  return !result.fumble && result.successes >= 1;
}

/** Resolve an opposed pool: higher successes wins; ties broken by total dice sum. */
export function resolveOpposed(
  a: DiceRollResult,
  b: DiceRollResult,
): 'a' | 'b' | 'tie' {
  const aOk = rollSucceeded(a) ? a.successes : -1;
  const bOk = rollSucceeded(b) ? b.successes : -1;
  if (aOk !== bOk) return aOk > bOk ? 'a' : 'b';
  if (a.total !== b.total) return a.total > b.total ? 'a' : 'b';
  return 'tie';
}
