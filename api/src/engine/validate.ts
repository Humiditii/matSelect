/**
 * Plausibility checks on AI-supplied material data 
 * Out-of-bounds data is never "fixed": the material goes to invalidData.
 */
import {
  ExcludedMaterial,
  Material,
  PROPERTY_KEYS,
  PROPERTY_META,
  PropertyKey,
  Range,
} from 'src/common/domain/domain.types';

/** Physical bounds per property */
export const BOUNDS: Record<PropertyKey, [number, number]> = {
  density: [1, 25_000],
  E: [1e-5, 1300],
  G: [1e-6, 1300],
  strength: [0.001, 10_000],
  Kic: [0.001, 300],
  tMax: [-273, 4000],
  tMin: [-273, 2000],
  lambda: [0.001, 3000],
  alpha: [-50, 500],
  price: [0.01, 200_000],
};

/** Properties where max/min is meaningful (strictly positive quantities). */
const RATIO_CHECKED: PropertyKey[] = [
  'density',
  'E',
  'G',
  'strength',
  'Kic',
  'lambda',
  'price',
];
export const WIDE_RANGE_RATIO = 30;

export interface ValidationOutcome {
  valid: Material[];
  invalid: ExcludedMaterial[];
  /** Data flags per material id (reordered ranges, wide ranges, low confidence, …). */
  flags: Map<string, string[]>;
  duplicatesRemoved: string[];
}

const fmt = (x: number) =>
  Math.abs(x) >= 1000 || Math.abs(x) < 0.01
    ? x.toPrecision(3)
    : String(+x.toPrecision(3));

export function validateMaterials(input: Material[]): ValidationOutcome {
  const valid: Material[] = [];
  const invalid: ExcludedMaterial[] = [];
  const flags = new Map<string, string[]>();
  const duplicatesRemoved: string[] = [];
  const seen = new Set<string>();

  for (const original of input) {
    const key = `${original.name.trim().toLowerCase()}|${(original.grade ?? '').trim().toLowerCase()}`;
    if (seen.has(key)) {
      duplicatesRemoved.push(
        original.grade ? `${original.name} (${original.grade})` : original.name,
      );
      continue;
    }
    seen.add(key);

    const m: Material = { ...original };
    const f: string[] = [];
    const problems: string[] = [];

    for (const k of PROPERTY_KEYS) {
      const r = m[k];
      if (r === null) continue;
      let [lo, hi] = r;
      const meta = PROPERTY_META[k];
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
        problems.push(`${meta.label} is not a number`);
        continue;
      }
      if (lo > hi) {
        [lo, hi] = [hi, lo];
        f.push(
          `${meta.label} range was reversed in the AI data and has been reordered`,
        );
      }
      const [bLo, bHi] = BOUNDS[k];
      if (lo < bLo || hi > bHi) {
        problems.push(
          `${meta.label} ${fmt(lo)}–${fmt(hi)} ${meta.unit} is outside the physically plausible ${fmt(bLo)}–${fmt(bHi)} ${meta.unit}`,
        );
        continue;
      }
      if (RATIO_CHECKED.includes(k) && lo > 0 && hi / lo > WIDE_RANGE_RATIO) {
        f.push(
          `${meta.label} range is very wide (${fmt(lo)}–${fmt(hi)} ${meta.unit}), so results for it are uncertain`,
        );
      }
      m[k] = [lo, hi] as Range;
    }

    const extra: Record<string, Range | null> = {};
    for (const [k, r] of Object.entries(m.extra ?? {})) {
      if (r === null) {
        extra[k] = null;
        continue;
      }
      let [lo, hi] = r;
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
        problems.push(`${k} is not a number`);
        continue;
      }
      if (lo > hi) {
        [lo, hi] = [hi, lo];
        f.push(`${k} range was reversed in the AI data and has been reordered`);
      }
      if (lo > 0 && hi / lo > WIDE_RANGE_RATIO)
        f.push(
          `${k} range is very wide (${fmt(lo)}–${fmt(hi)}), so results for it are uncertain`,
        );
      extra[k] = [lo, hi];
    }
    m.extra = extra;

    if (problems.length) {
      invalid.push({
        materialId: m.id,
        name: m.name,
        family: m.family,
        grade: m.grade,
        reasons: problems,
      });
      continue;
    }

    if (m.G && m.E && (m.G[1] > m.E[1] || m.G[0] > m.E[0])) {
      f.push(
        'Shear modulus G was larger than E (physically impossible) and was discarded',
      );
      m.G = null;
    }
    if (m.tMin && m.tMax && m.tMin[0] > m.tMax[1]) {
      invalid.push({
        materialId: m.id,
        name: m.name,
        family: m.family,
        grade: m.grade,
        reasons: [
          'Minimum service temperature is above the maximum service temperature',
        ],
      });
      continue;
    }
    if (m.confidence === 'low')
      f.push(
        'AI confidence in this data is low — verify with a supplier datasheet',
      );

    flags.set(m.id, f);
    valid.push(m);
  }
  return { valid, invalid, flags, duplicatesRemoved };
}
