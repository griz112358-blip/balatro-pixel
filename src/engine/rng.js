// Deterministic PRNG (mulberry32) so runs are seedable & reproducible.
export function makeRng(seed = Date.now()) {
  let a = (seed >>> 0) || 1;
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    seed,
    next,
    int: (n) => Math.floor(next() * n),
    range: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
    shuffle: (arr) => {
      const a2 = arr.slice();
      for (let i = a2.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a2[i], a2[j]] = [a2[j], a2[i]];
      }
      return a2;
    },
    weighted: (entries) => {
      // entries: [[value, weight], ...]
      let total = 0;
      for (const e of entries) total += e[1];
      let r = next() * total;
      for (const e of entries) {
        r -= e[1];
        if (r <= 0) return e[0];
      }
      return entries[entries.length - 1][0];
    },
  };
}
