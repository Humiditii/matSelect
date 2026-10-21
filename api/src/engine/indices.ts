// Material indices (Ashby): which combination of properties to maximise for a
// given part and goal.
import {
  Component,
  Criterion,
  Objective,
  Section,
} from 'src/common/domain/domain.types';

/**
 * Index = product of property^exponent. Higher is better. Keys are standard
 * property keys or custom ones (e.g. "friction_coefficient").
 */
export type IndexTerms = Partial<Record<string, number>>;

export interface IndexDef {
  criterion: Criterion | 'single';
  terms: IndexTerms;
  expression: string;
  description: string;
}

export interface CustomIndexInput {
  terms: IndexTerms;
  description: string;
  /** Display symbols for custom properties, e.g. { friction_coefficient: "μ" }. */
  symbols: Record<string, string>;
}

const SYMBOL: Record<string, string> = {
  E: 'E',
  G: 'G',
  strength: 'σ',
  density: 'ρ',
  price: 'C',
  co2: 'CO₂',
  embodiedEnergy: 'H',
  lambda: 'λ',
  alpha: 'α',
  Kic: 'K_IC',
  tMax: 'T_max',
  tMin: 'T_min',
};

const TERM_ORDER: string[] = [
  'strength',
  'E',
  'G',
  'Kic',
  'lambda',
  'alpha',
  'tMax',
  'tMin',
  'density',
  'price',
  'co2',
  'embodiedEnergy',
];

/** Closest fraction with a denominator up to 12, for display. */
export function toFraction(x: number): [number, number] {
  let best: [number, number] = [Math.round(x), 1];
  let bestError = Math.abs(x - best[0]);
  for (let denominator = 2; denominator <= 12; denominator++) {
    const numerator = Math.round(x * denominator);
    const error = Math.abs(x - numerator / denominator);
    if (error < bestError - 1e-12) {
      best = [numerator, denominator];
      bestError = error;
    }
  }
  return best;
}

function powerString(symbol: string, exponent: number): string {
  const [numerator, denominator] = toFraction(exponent);
  if (denominator === 1)
    return numerator === 1 ? symbol : `${symbol}^${numerator}`;
  return `${symbol}^(${numerator}/${denominator})`;
}

/**
 * Writes an index in the usual Ashby form, e.g. "E^(1/2)/ρ", "E/ρ·C", "1/λ".
 * Denominator factors are an unbracketed product, as Ashby writes "E/ρC".
 */
export function formatIndex(
  terms: IndexTerms,
  symbols: Record<string, string> = {},
): string {
  const numerator: string[] = [];
  const denominator: string[] = [];
  const keys = [
    ...TERM_ORDER.filter((key) => terms[key]),
    ...Object.keys(terms)
      .filter((key) => !TERM_ORDER.includes(key))
      .sort(),
  ];
  for (const key of keys) {
    const exponent = terms[key];
    if (!exponent) continue;
    const factor = powerString(
      symbols[key] ?? SYMBOL[key] ?? key,
      Math.abs(exponent),
    );
    if (exponent > 0) numerator.push(factor);
    else denominator.push(factor);
  }
  const top = numerator.length ? numerator.join('·') : '1';
  return denominator.length ? `${top}/${denominator.join('·')}` : top;
}

/** NaN when a property is missing, not finite or not positive. */
export function evaluateIndex(
  terms: IndexTerms,
  values: Partial<Record<string, number>>,
): number {
  let result = 1;
  for (const [key, exponent] of Object.entries(terms) as [string, number][]) {
    const value = values[key];
    if (value === undefined || !Number.isFinite(value) || value <= 0)
      return NaN;
    result *= value ** exponent;
  }
  return result;
}

/** Components whose index has no density term, so the goal cannot change the ranking. */
export const MASSLESS_INDEX: Component[] = ['hinge', 'thermal_shock'];

// "Cheapest" divides by price per kg (ρ becomes ρ·C) and "lowest carbon" by
// CO₂ per kg (ρ becomes ρ·CO₂). The balanced goal is applied later, on top of
// the mass index.
const PER_KG_TERM: Record<Objective, 'price' | 'co2' | null> = {
  min_mass: null,
  min_cost: 'price',
  min_carbon: 'co2',
  balanced: null,
};

const PER_UNIT_TEXT: Record<Objective, string> = {
  min_mass: 'per unit mass',
  min_cost: 'per unit cost',
  min_carbon: 'per unit of CO₂',
  balanced: 'per unit mass',
};

/**
 * The indices for a design. Beam and column exponents come from how the
 * section scales with its size s (see SectionGeometry):
 *   stiffness-limited: s ∝ E^(-1/pI) and mass ∝ ρ·s^pA, so the index is E^(pA/pI)/ρ
 *   strength-limited:  s ∝ σ^(-1/pZ) and mass ∝ ρ·s^pA, so the index is σ^(pA/pZ)/ρ
 */
export function deriveIndices(
  component: Component,
  criteria: Criterion[],
  section: Section,
  objective: Objective,
  custom: CustomIndexInput | null = null,
): IndexDef[] {
  const isBoard = section === 'rect_fixed_width';
  // Only the shape matters for the exponents, not the board width.
  const { pA, pI, pZ } = isBoard
    ? { pA: 1, pI: 3, pZ: 2 }
    : { pA: 2, pI: 4, pZ: 3 };
  const perKgTerm = PER_KG_TERM[objective];
  const per = PER_UNIT_TEXT[objective];

  const indices: IndexDef[] = [];
  const add = (
    criterion: IndexDef['criterion'],
    terms: IndexTerms,
    description: string,
  ) => {
    const withGoal =
      perKgTerm && terms.density ? { ...terms, [perKgTerm]: -1 } : terms;
    indices.push({
      criterion,
      terms: withGoal,
      expression: formatIndex(withGoal, custom?.symbols),
      description,
    });
  };
  const wants = (criterion: Criterion) => criteria.includes(criterion);

  switch (component) {
    case 'tie':
      if (wants('stiffness'))
        add(
          'stiffness',
          { E: 1, density: -1 },
          `Stiff tie: most stretch resistance ${per}`,
        );
      if (wants('strength'))
        add(
          'strength',
          { strength: 1, density: -1 },
          `Strong tie: most load before yielding ${per}`,
        );
      break;
    case 'beam':
      if (wants('stiffness'))
        add(
          'stiffness',
          { E: pA / pI, density: -1 },
          isBoard
            ? `Stiff board/panel (width fixed, thickness free): least bending ${per}`
            : `Stiff beam (section size free): least bending ${per}`,
        );
      if (wants('strength'))
        add(
          'strength',
          { strength: pA / pZ, density: -1 },
          isBoard
            ? `Strong board/panel (width fixed, thickness free): most bending load ${per}`
            : `Strong beam (section size free): most bending load ${per}`,
        );
      break;
    case 'column':
      // Any slender column can buckle, so the buckling index always applies.
      // The strength criterion adds the crushing index σ/ρ.
      add(
        'stiffness',
        { E: pA / pI, density: -1 },
        `Column that resists buckling ${per}`,
      );
      if (wants('strength'))
        add(
          'strength',
          { strength: 1, density: -1 },
          `Column that resists crushing ${per}`,
        );
      break;
    case 'shaft':
      if (wants('stiffness'))
        add(
          'stiffness',
          { G: 1 / 2, density: -1 },
          `Shaft that resists twisting ${per}`,
        );
      if (wants('strength'))
        add(
          'strength',
          { strength: 2 / 3, density: -1 },
          `Shaft that carries torque without yielding ${per}`,
        );
      break;
    case 'spring':
      add(
        'single',
        { strength: 2, E: -1, density: -1 },
        `Spring: most stored elastic energy ${per}`,
      );
      break;
    case 'hinge':
      add(
        'single',
        { strength: 1, E: -1 },
        'Flexure hinge: bends furthest without yielding',
      );
      break;
    case 'insulation':
      add(
        'single',
        perKgTerm
          ? { lambda: -1, density: -1, [perKgTerm]: -1 }
          : { lambda: -1 },
        perKgTerm
          ? `Insulation: least heat flow ${per}`
          : 'Insulation: least heat flow for a given thickness',
      );
      break;
    case 'thermal_shock':
      add(
        'single',
        { strength: 1, E: -1, alpha: -1 },
        'Survives the largest sudden temperature change',
      );
      break;
    case 'custom':
      if (custom && Object.keys(custom.terms).length) {
        // "Cheapest" still prefers cheaper stock even when the custom index has no density term.
        const terms: IndexTerms = perKgTerm
          ? { ...custom.terms, [perKgTerm]: -1 }
          : custom.terms;
        indices.push({
          criterion: 'single',
          terms,
          expression: formatIndex(terms, custom.symbols),
          description: custom.description + (perKgTerm ? ` (${per})` : ''),
        });
      } else if (perKgTerm) {
        add(
          'single',
          { [perKgTerm]: -1 },
          perKgTerm === 'price'
            ? 'Cheapest material per kg that meets every requirement'
            : 'Lowest carbon footprint per kg that meets every requirement',
        );
      } else {
        add(
          'single',
          { density: -1 },
          'Lightest material (lowest density) that meets every requirement',
        );
      }
      break;
  }
  return indices;
}
