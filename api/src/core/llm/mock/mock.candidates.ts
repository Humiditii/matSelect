import { DesignSpec, Family, Material } from 'src/common/domain/domain.types';
import { mapCustomEnvironments } from 'src/engine/environments';
import { MOCK_MATERIALS } from './mock.materials';

// The demo set is small and curated, so every material of the family is returned and the count is ignored.
export function mockCandidates(
  family: Family,
  _count: number,
): Omit<Material, 'id'>[] {
  return MOCK_MATERIALS.filter((material) => material.family === family);
}

// Custom properties that at least one demo material has values for.
const DEMO_CUSTOM_PROPERTY_KEYS = new Set(
  MOCK_MATERIALS.flatMap((material) => Object.keys(material.extra)),
);

/**
 * Adapts a spec to what the demo data can check. Custom environments are mapped to the closest built-in
 * ones, and custom properties the demo set has no values for are dropped. Every change is reported.
 */
export function demoAdjust(spec: DesignSpec): {
  spec: DesignSpec;
  notes: string[];
} {
  const mapped = mapCustomEnvironments(spec);
  const notes = [...mapped.notes];
  let adjusted = mapped.spec;
  const unsupported = adjusted.customProperties.filter(
    (property) => !DEMO_CUSTOM_PROPERTY_KEYS.has(property.key),
  );
  if (unsupported.length) {
    const dropped = new Set(unsupported.map((property) => property.key));
    const terms =
      adjusted.customObjective?.terms.filter(
        (term) => !dropped.has(term.property),
      ) ?? [];
    adjusted = {
      ...adjusted,
      customProperties: adjusted.customProperties.filter(
        (property) => !dropped.has(property.key),
      ),
      propertyLimits: adjusted.propertyLimits.filter(
        (limit) => !dropped.has(limit.property),
      ),
      customObjective:
        adjusted.customObjective && terms.length
          ? { ...adjusted.customObjective, terms }
          : null,
    };
    const plural = unsupported.length > 1;
    notes.push(
      `The demo data has no values for ${unsupported.map((p) => p.label.toLowerCase()).join(', ')}, so ${plural ? 'those requirements were' : 'that requirement was'} not checked. Add an LLM API key to have every material rated for ${plural ? 'them' : 'it'}.`,
    );
  }
  return { spec: adjusted, notes };
}
