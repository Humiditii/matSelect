import {
  DesignSpec,
  ExcludedMaterial,
  Material,
  Range,
  Sizing,
} from 'src/common/domain/domain.types';
import { formatUsd } from './labels';
import { ResolvedDesign } from './design';
import { ConstraintKey, GOVERNING_TEXT, sizePart } from './sizing';
import { IndexDef, IndexTerms, evaluateIndex } from './indices';
import { SectionGeometry, area, describeSection, formatMm } from './section';
import { G_FROM_E, propertyRange } from './properties';
import { geoMean, sampleRange } from './random';

const GPA = 1e9;
const MPA = 1e6;

/** One set of property values for a material, either nominal or a Monte Carlo draw. */
export interface PropertyValues {
  /** Pa */
  E: number;
  /** Pa */
  G: number;
  /** Pa */
  strength: number;
  /** kg/m³ */
  density: number;
  /** USD/kg */
  price: number;
  /** W/m·K */
  lambda: number;
  /** 1/K */
  alpha: number;
  /** kg CO₂e per kg */
  co2: number;
  /** Every property in its stored unit (GPa, MPa, µstrain/K...), custom ones included. Indices use these. */
  indexInputs: Record<string, number>;
}

/** A material that passed screening, with everything calculated for it so far. */
export interface Candidate {
  material: Material;
  gEstimated: boolean;
  flags: string[];
  geometry: SectionGeometry | null;
  sectionNotes: string[];
  nominal: PropertyValues;
  /** Part mass, cost, carbon or penalty in sizing mode; combined index score (%) in index mode. */
  objective: number;
  sizing: Sizing | null;
  indexValues: Record<string, number>;
  /** The objective in each Monte Carlo draw. */
  samples: number[];
}

const lowEnd = (range: Range | null) => (range ? range[0] : NaN);
const highEnd = (range: Range | null) => (range ? range[1] : NaN);
const typical = (range: Range | null) =>
  range ? geoMean(range[0], range[1]) : NaN;

// Conservative values for sizing: the weak end of E, G and strength, typical
// density and price, and the high end of conductivity and expansion.
export function nominalProperties(material: Material): PropertyValues {
  return {
    E: lowEnd(material.E) * GPA,
    G: lowEnd(material.G) * GPA,
    strength: lowEnd(material.strength) * MPA,
    density: typical(material.density),
    price: typical(material.price),
    lambda: highEnd(material.lambda),
    alpha: highEnd(material.alpha) * 1e-6,
    co2: typical(material.co2),
    indexInputs: {},
  };
}

// Conservative values for an index: for each term take the end of the range
// that makes the index worse (low end for a positive exponent, high end for a
// negative one). Density and price use the typical value.
function nominalIndexInputs(
  material: Material,
  terms: IndexTerms,
): Record<string, number> {
  const inputs: Record<string, number> = {};
  for (const [key, exponent] of Object.entries(terms) as [string, number][]) {
    const range = propertyRange(material, key);
    if (key === 'density' || key === 'price') inputs[key] = typical(range);
    else inputs[key] = exponent > 0 ? lowEnd(range) : highEnd(range);
  }
  return inputs;
}

export function nominalIndexValue(material: Material, index: IndexDef) {
  return evaluateIndex(index.terms, nominalIndexInputs(material, index.terms));
}

export function sampleProperties(
  material: Material,
  rng: () => number,
  gEstimated: boolean,
): PropertyValues {
  const draw = (range: Range | null) =>
    range ? sampleRange(rng, range[0], range[1]) : NaN;
  // Every property is drawn in a fixed order, so the random stream (and the
  // result) is the same whichever properties end up being used.
  const E = draw(material.E);
  const G = draw(material.G);
  const values: PropertyValues = {
    E: E * GPA,
    // An estimated G follows the drawn E instead of varying on its own.
    G: (gEstimated ? E / G_FROM_E : G) * GPA,
    strength: draw(material.strength) * MPA,
    density: draw(material.density),
    price: draw(material.price),
    lambda: draw(material.lambda),
    alpha: draw(material.alpha) * 1e-6,
    co2: NaN,
    indexInputs: {},
  };
  values.indexInputs = {
    E,
    G: values.G / GPA,
    strength: values.strength / MPA,
    density: values.density,
    price: values.price,
    lambda: values.lambda,
    alpha: values.alpha * 1e6,
    Kic: draw(material.Kic),
    tMax: draw(material.tMax),
    tMin: draw(material.tMin),
    co2: draw(material.co2),
    embodiedEnergy: draw(material.embodiedEnergy),
  };
  values.co2 = values.indexInputs.co2;
  for (const key of Object.keys(material.extra ?? {}).sort())
    values.indexInputs[key] = draw(material.extra[key]);
  return values;
}

export function sizeForProperties(
  design: ResolvedDesign,
  geometry: SectionGeometry,
  props: PropertyValues,
): {
  massKg: number;
  size: number;
  governing: ConstraintKey;
  areaM2: number;
} | null {
  const sized = sizePart(design.sizing!, geometry, {
    E: props.E,
    G: props.G,
    strength: props.strength,
  });
  if (!sized) return null;
  const areaM2 = area(geometry, sized.size);
  return {
    size: sized.size,
    governing: sized.governing,
    areaM2,
    massKg: props.density * areaM2 * design.sizing!.lengthM,
  };
}

/**
 * Penalty per kg of material for the balanced goal: C + α_m + α_CO₂·CO₂ (USD-equivalent per kg).
 * It is 1 for every other goal, so indices are unchanged.
 */
export function penaltyPerKg(
  design: ResolvedDesign,
  price: number,
  co2: number,
): number {
  const constants = design.exchangeConstants;
  if (!constants) return 1;
  return price + constants.mass + (constants.co2 > 0 ? constants.co2 * co2 : 0);
}

/** What one kg of material counts for under the goal: 1 (mass), USD (cost), kg CO₂e (carbon) or the penalty (balanced). */
export function perKgFactor(
  design: ResolvedDesign,
  props: PropertyValues,
): number {
  switch (design.goal) {
    case 'balanced':
      return penaltyPerKg(design, props.price, props.co2);
    case 'min_cost':
      return props.price;
    case 'min_carbon':
      return props.co2;
    default:
      return 1;
  }
}

export const indexKey = (index: IndexDef, design: ResolvedDesign) =>
  design.indices.length > 1
    ? `${index.criterion}: ${index.expression}`
    : index.expression;

/** The highest finite value of each index across the rows. */
export function bestIndexValues(
  rows: Record<string, number>[],
): Record<string, number> {
  const best: Record<string, number> = {};
  for (const row of rows)
    for (const [key, value] of Object.entries(row))
      if (Number.isFinite(value) && !(value <= (best[key] ?? -Infinity)))
        best[key] = value;
  return best;
}

/** The weakest index as a % of the best value for that index. */
export function combinedScore(
  values: Record<string, number>,
  best: Record<string, number>,
): number {
  let score = Infinity;
  for (const [key, value] of Object.entries(values))
    score = Math.min(score, (value / best[key]) * 100);
  return score;
}

export const excluded = (
  material: Material,
  reasons: string[],
): ExcludedMaterial => ({
  materialId: material.id,
  name: material.name,
  family: material.family,
  grade: material.grade,
  reasons,
});

/**
 * Calculates the nominal objective of every candidate and returns those that
 * fit, in no particular order. Parts that turn out impractical or over budget
 * are added to `rejected`; ones that cannot be calculated to `notEvaluated`.
 */
export function evaluateCandidates(
  spec: DesignSpec,
  design: ResolvedDesign,
  candidates: Candidate[],
  rejected: ExcludedMaterial[],
  notEvaluated: ExcludedMaterial[],
): Candidate[] {
  const fitting: Candidate[] = [];
  for (const candidate of candidates) {
    const material = candidate.material;
    for (const index of design.indices) {
      const penalty = index.terms.density
        ? penaltyPerKg(
            design,
            typical(material.price),
            typical(material.co2 ?? null),
          )
        : 1;
      candidate.indexValues[indexKey(index, design)] =
        nominalIndexValue(material, index) / penalty;
    }

    if (design.mode === 'sizing') {
      const outcome = sizeCandidate(spec, design, candidate);
      if (outcome === 'not_sized') {
        notEvaluated.push(
          excluded(material, [
            'Could not size the part from the available data',
          ]),
        );
        continue;
      }
      if (outcome !== 'fits') {
        rejected.push(excluded(material, [outcome.rejected]));
        continue;
      }
    } else if (
      Object.values(candidate.indexValues).some((x) => !Number.isFinite(x))
    ) {
      notEvaluated.push(
        excluded(material, [
          'Could not compute the performance index from the available data',
        ]),
      );
      continue;
    }
    fitting.push(candidate);
  }

  if (design.mode === 'index') {
    const best = bestIndexValues(fitting.map((c) => c.indexValues));
    for (const candidate of fitting)
      candidate.objective = combinedScore(candidate.indexValues, best);
  }
  return fitting;
}

type SizingOutcome = 'fits' | 'not_sized' | { rejected: string };

/** Sizes the part for one candidate and fills in its sizing and objective. */
function sizeCandidate(
  spec: DesignSpec,
  design: ResolvedDesign,
  candidate: Candidate,
): SizingOutcome {
  const material = candidate.material;
  const geometry = candidate.geometry!;
  const sized = sizeForProperties(design, geometry, candidate.nominal);
  if (!sized || !Number.isFinite(sized.massKg)) return 'not_sized';

  const lengthM = design.sizing!.lengthM;
  const costUsd: Range | null = material.price
    ? [sized.massKg * material.price[0], sized.massKg * material.price[1]]
    : null;
  const notes = [...candidate.sectionNotes];
  if (
    geometry.section === 'rect_fixed_width' &&
    geometry.widthM &&
    sized.size > geometry.widthM
  )
    notes.push(
      'The board would be thicker than it is wide — a deeper, narrower section would be more efficient',
    );
  candidate.sizing = {
    dimension: describeSection(geometry, sized.size),
    sizeMm: sized.size * 1000,
    sectionUsed: geometry.section,
    areaMm2: sized.areaM2 * 1e6,
    massKg: sized.massKg,
    costUsd,
    governing: GOVERNING_TEXT[sized.governing],
    notes,
  };
  candidate.objective = sized.massKg * perKgFactor(design, candidate.nominal);

  // Slender-member formulas are meaningless once the section is as big as the span.
  if (
    (spec.component === 'beam' || spec.component === 'column') &&
    sized.size > lengthM / 2
  )
    return {
      rejected: `Would need a section about ${formatMm(sized.size * 1000)} mm across for a ${formatMm(lengthM * 1000)} mm long part — far too bulky to be practical`,
    };

  if (spec.budgetPerPart !== null && costUsd) {
    if (costUsd[0] > spec.budgetPerPart)
      return {
        rejected: `The part would cost at least ${formatUsd(costUsd[0])} in material, above your ${formatUsd(spec.budgetPerPart)} budget`,
      };
    if (costUsd[1] > spec.budgetPerPart)
      candidate.flags.push(
        `At the top of its price range the part could exceed your budget (${formatUsd(costUsd[1])})`,
      );
  }
  return 'fits';
}
