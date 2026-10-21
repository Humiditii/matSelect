/** JSON.stringify with sorted object keys, so equal data always hashes equally. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object')
    return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`;
}

/** 32-bit FNV-1a hash. */
export function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Draw from a property range. Strictly positive ranges are sampled log-uniformly
 * (material properties vary multiplicatively); ranges touching zero or negative fall back to uniform.
 */
export function sampleRange(rng: () => number, lo: number, hi: number): number {
  if (hi <= lo) return lo;
  const u = rng();
  if (lo > 0) return Math.exp(Math.log(lo) + u * (Math.log(hi) - Math.log(lo)));
  return lo + u * (hi - lo);
}

/** Linear-interpolated percentile of an ascending-sorted array (q in [0, 1]). */
export function percentile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const i = Math.floor(pos);
  const frac = pos - i;
  return i + 1 < sorted.length
    ? sorted[i] * (1 - frac) + sorted[i + 1] * frac
    : sorted[i];
}

export const geoMean = (lo: number, hi: number) =>
  lo > 0 && hi > 0 ? Math.sqrt(lo * hi) : (lo + hi) / 2;
