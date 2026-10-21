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

/** Small seeded random number generator returning values in [0, 1). */
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

// Material properties vary multiplicatively, so strictly positive ranges are
// sampled log-uniformly. Ranges that touch zero or go negative are sampled uniformly.
export function sampleRange(
  rng: () => number,
  low: number,
  high: number,
): number {
  if (high <= low) return low;
  const u = rng();
  if (low > 0)
    return Math.exp(Math.log(low) + u * (Math.log(high) - Math.log(low)));
  return low + u * (high - low);
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

/** Geometric mean of a positive range, arithmetic mean otherwise. */
export const geoMean = (low: number, high: number) =>
  low > 0 && high > 0 ? Math.sqrt(low * high) : (low + high) / 2;
