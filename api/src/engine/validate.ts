// Plausibility checks on material data supplied by the AI. Out-of-bounds data
// is never "fixed": the material goes to invalidData instead.
import {
  ExcludedMaterial,
  Material,
  PROPERTY_KEYS,
  PROPERTY_META,
  PropertyKey,
  Range,
} from 'src/common/domain/domain.types';

/** Physically plausible [min, max] per property, in its stored unit. */
const BOUNDS: Record<PropertyKey, [number, number]> = {
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
  co2: [0.001, 5000],
  embodiedEnergy: [0.01, 100_000],
};

// Strictly positive properties, where the max / min ratio is meaningful.
const RATIO_CHECKED: PropertyKey[] = [
  'density',
  'E',
  'G',
  'strength',
  'Kic',
  'lambda',
  'price',
  'co2',
  'embodiedEnergy',
];
const WIDE_RANGE_RATIO = 30;

export interface ValidationOutcome {
  valid: Material[];
  invalid: ExcludedMaterial[];
  /** Data warnings per material id: reordered ranges, wide ranges, low confidence. */
  flags: Map<string, string[]>;
  duplicatesRemoved: string[];
}

const formatValue = (x: number) =>
  Math.abs(x) >= 1000 || Math.abs(x) < 0.01
    ? x.toPrecision(3)
    : String(+x.toPrecision(3));

export function validateMaterials(input: Material[]): ValidationOutcome {
  const valid: Material[] = [];
  const invalid: ExcludedMaterial[] = [];
  const flags = new Map<string, string[]>();
  const duplicatesRemoved: string[] = [];
  const seen = new Set<string>();
  const reject = (material: Material, reasons: string[]) =>
    invalid.push({
      materialId: material.id,
      name: material.name,
      family: material.family,
      grade: material.grade,
      reasons,
    });

  for (const original of input) {
    const key = `${original.name.trim().toLowerCase()}|${(original.grade ?? '').trim().toLowerCase()}`;
    if (seen.has(key)) {
      duplicatesRemoved.push(
        original.grade ? `${original.name} (${original.grade})` : original.name,
      );
      continue;
    }
    seen.add(key);

    const material: Material = { ...original };
    const warnings: string[] = [];
    const problems: string[] = [];

    for (const key of PROPERTY_KEYS) {
      const range = material[key];
      if (range === null) continue;
      let [low, high] = range;
      const meta = PROPERTY_META[key];
      if (!Number.isFinite(low) || !Number.isFinite(high)) {
        problems.push(`${meta.label} is not a number`);
        continue;
      }
      if (low > high) {
        [low, high] = [high, low];
        warnings.push(
          `${meta.label} range was reversed in the AI data and has been reordered`,
        );
      }
      const [minPlausible, maxPlausible] = BOUNDS[key];
      if (low < minPlausible || high > maxPlausible) {
        problems.push(
          `${meta.label} ${formatValue(low)}–${formatValue(high)} ${meta.unit} is outside the physically plausible ${formatValue(minPlausible)}–${formatValue(maxPlausible)} ${meta.unit}`,
        );
        continue;
      }
      if (
        RATIO_CHECKED.includes(key) &&
        low > 0 &&
        high / low > WIDE_RANGE_RATIO
      ) {
        warnings.push(
          `${meta.label} range is very wide (${formatValue(low)}–${formatValue(high)} ${meta.unit}), so results for it are uncertain`,
        );
      }
      material[key] = [low, high] as Range;
    }

    // Custom properties have no known bounds, so only order and width are checked.
    const extra: Record<string, Range | null> = {};
    for (const [key, range] of Object.entries(material.extra ?? {})) {
      if (range === null) {
        extra[key] = null;
        continue;
      }
      let [low, high] = range;
      if (!Number.isFinite(low) || !Number.isFinite(high)) {
        problems.push(`${key} is not a number`);
        continue;
      }
      if (low > high) {
        [low, high] = [high, low];
        warnings.push(
          `${key} range was reversed in the AI data and has been reordered`,
        );
      }
      if (low > 0 && high / low > WIDE_RANGE_RATIO)
        warnings.push(
          `${key} range is very wide (${formatValue(low)}–${formatValue(high)}), so results for it are uncertain`,
        );
      extra[key] = [low, high];
    }
    material.extra = extra;

    if (problems.length) {
      reject(material, problems);
      continue;
    }

    const { E, G, tMin, tMax } = material;
    if (G && E && (G[1] > E[1] || G[0] > E[0])) {
      warnings.push(
        'Shear modulus G was larger than E (physically impossible) and was discarded',
      );
      material.G = null;
    }
    if (tMin && tMax && tMin[0] > tMax[1]) {
      reject(material, [
        'Minimum service temperature is above the maximum service temperature',
      ]);
      continue;
    }
    if (material.confidence === 'low')
      warnings.push(
        'AI confidence in this data is low — verify with a supplier datasheet',
      );

    flags.set(material.id, warnings);
    valid.push(material);
  }
  return { valid, invalid, flags, duplicatesRemoved };
}
