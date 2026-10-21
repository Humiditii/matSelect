import type { Component, DesignSpec, Section } from './types';

// Components the engine can size when it knows the load and length.
const SIZED_COMPONENTS: Component[] = ['beam', 'tie', 'column', 'shaft'];

export const isSizedComponent = (component: Component) => SIZED_COMPONENTS.includes(component);

export const isTubeSection = (section: Section) => section === 'round_tube' || section === 'square_tube';

const QUANTITY_FIELDS = ['load', 'length', 'maxDeflection', 'sectionWidth'];
const MM_PER_UNIT: Record<string, number> = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 };

/** Writes the answer to a clarifying question into the spec, without asking the LLM again. */
export function applyAnswer(spec: DesignSpec, field: string, value: unknown): DesignSpec {
  if (!(field in spec)) return spec;

  if (QUANTITY_FIELDS.includes(field)) {
    const quantity = value as { value?: number; unit?: string } | null;
    const isValid = quantity && typeof quantity.value === 'number' && quantity.unit;
    const next = { ...spec, [field]: isValid ? { value: quantity.value, unit: quantity.unit } : null };

    // A beam that must not bend too much needs a bending limit. Once the span is known we default
    // to span/200 and say so in the assumptions, where the user can remove it.
    const needsBendingLimit =
      field === 'length' && next.length && next.component === 'beam' && next.criteria.includes('stiffness') && !next.maxDeflection;
    if (needsBendingLimit && next.length) {
      const spanMm = next.length.value * (MM_PER_UNIT[next.length.unit] ?? 1000);
      const limitMm = Math.round((spanMm / 200) * 10) / 10;
      next.maxDeflection = { value: limitMm, unit: 'mm' };
      next.assumptions = [...next.assumptions, `Allowed bending ${limitMm} mm (span/200, a common limit so it doesn't visibly sag).`];
    }
    return next;
  }

  if (field === 'tempRangeC' && value && !Array.isArray(value)) {
    const range = value as { min: number; max: number };
    return { ...spec, tempRangeC: [range.min, range.max] };
  }

  return { ...spec, [field]: value } as DesignSpec;
}

/** The same checks the API makes, so problems show up before the long run starts. */
export function findSpecProblems(spec: DesignSpec): string[] {
  const problems: string[] = [];
  if (!spec.title.trim()) problems.push('Give the part a name.');
  if (!spec.criteria.length && spec.component !== 'custom') {
    problems.push('Choose at least one of “not bend too much” / “not break”.');
  }
  if (spec.tempRangeC && spec.tempRangeC[0] > spec.tempRangeC[1]) problems.push('The coldest temperature is above the hottest.');
  if (spec.safetyFactor !== null && spec.safetyFactor < 1) problems.push('The safety factor must be at least 1.');
  if (isTubeSection(spec.section) && spec.tubeRatio < 2.5) problems.push('Tube outer size ÷ wall must be at least 2.5.');
  return problems;
}

/** Fills in fields that results saved by older versions don't have. */
export function withSpecDefaults(saved: DesignSpec): DesignSpec {
  const spec = saved as Partial<DesignSpec>;
  return {
    ...saved,
    customEnvironments: spec.customEnvironments ?? [],
    function: spec.function ?? '',
    customProperties: spec.customProperties ?? [],
    propertyLimits: spec.propertyLimits ?? [],
    customObjective: spec.customObjective ?? null,
    penalty: spec.penalty ?? null,
    country: spec.country ?? null,
  };
}
