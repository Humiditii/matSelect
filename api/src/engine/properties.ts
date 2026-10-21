import {
  DesignSpec,
  Material,
  PROPERTY_META,
  PropertyLimit,
  Range,
} from 'src/common/domain/domain.types';
import { formatNumber } from './labels';

// When only E is known, G is estimated as E / 2.6 (Poisson's ratio about 0.3).
// This is the only property the engine ever estimates, and it is always flagged.
export const G_FROM_E = 2.6;

export const isStandardProperty = (
  key: string,
): key is keyof typeof PROPERTY_META => key in PROPERTY_META;

/** Label, unit and symbol of a standard or custom property. */
export function propertyInfo(
  spec: DesignSpec,
  key: string,
): { label: string; unit: string; symbol: string } {
  if (isStandardProperty(key)) return PROPERTY_META[key];
  const custom = spec.customProperties?.find((p) => p.key === key);
  return {
    label: custom?.label ?? key,
    unit: custom?.unit ?? '',
    symbol: custom?.symbol || custom?.label || key,
  };
}

/** A material's [min, max] for a standard or custom property, or null if unknown. */
export function propertyRange(material: Material, key: string): Range | null {
  if (isStandardProperty(key)) return material[key];
  return material.extra?.[key] ?? null;
}

export const withUnit = (value: string, unit: string) =>
  unit ? `${value} ${unit}` : value;

export function describeLimit(spec: DesignSpec, limit: PropertyLimit): string {
  const info = propertyInfo(spec, limit.property);
  let bound: string;
  if (limit.min !== null && limit.max !== null)
    bound = `between ${formatNumber(limit.min)} and ${withUnit(formatNumber(limit.max), info.unit)}`;
  else if (limit.min !== null)
    bound = `at least ${withUnit(formatNumber(limit.min), info.unit)}`;
  else bound = `at most ${withUnit(formatNumber(limit.max!), info.unit)}`;
  return `${info.label} ${bound}${limit.reason ? ` — ${limit.reason}` : ''}`;
}
