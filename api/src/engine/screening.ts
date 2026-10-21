import {
  DesignSpec,
  Environment,
  Material,
  PROPERTY_META,
  RATINGS,
  Rating,
  Ratings,
  normEnv,
} from 'src/common/domain/domain.types';
import {
  ENV_LABEL,
  FAMILY_LABEL,
  PROCESS_LABEL,
  RATING_FIELD_LABEL,
  formatNumber,
  formatRange,
  formatUsd,
} from './labels';
import { ResolvedDesign } from './design';
import {
  G_FROM_E,
  isStandardProperty,
  propertyInfo,
  propertyRange,
  withUnit,
} from './properties';

type RatingField = keyof Ratings;

/** Durability ratings a material needs for each built-in environment. */
export const ENV_REQUIREMENTS: Record<
  Environment,
  { field: RatingField; min: Rating }[]
> = {
  indoor: [],
  outdoor: [
    { field: 'uv', min: 'C' },
    { field: 'fresh_water', min: 'C' },
  ],
  wet: [{ field: 'fresh_water', min: 'B' }],
  marine: [{ field: 'salt_water', min: 'B' }],
  chemical: [{ field: 'chemicals', min: 'B' }],
  food_contact: [],
};

// A custom environment is unknown territory, so it needs a "good" (B) rating,
// the same as wet, marine and chemical.
export const CUSTOM_ENV_MIN: Rating = 'B';

// RATINGS runs from best (A) to worst, so a lower index is a better rating.
const meetsRating = (rating: Rating, min: Rating) =>
  RATINGS.indexOf(rating) <= RATINGS.indexOf(min);

/** The material data the calculation needs. A material missing any of it is not evaluated. */
export interface RequiredData {
  properties: Set<keyof typeof PROPERTY_META>;
  customProperties: Set<string>;
  /** Shear modulus is tracked on its own because it can be estimated from E. */
  needsG: boolean;
}

export function requiredData(
  spec: DesignSpec,
  design: ResolvedDesign,
): RequiredData {
  const properties = new Set<keyof typeof PROPERTY_META>();
  const customProperties = new Set<string>();
  let needsG = false;
  const need = (key: string) => {
    if (key === 'G') needsG = true;
    else if (isStandardProperty(key)) properties.add(key);
    else customProperties.add(key);
  };

  for (const index of design.indices) Object.keys(index.terms).forEach(need);
  for (const limit of spec.propertyLimits) need(limit.property);

  if (design.sizing) {
    const sizing = design.sizing;
    properties.add('density');
    if (sizing.component === 'shaft') {
      if (sizing.checkStiffness) needsG = true;
    } else if (sizing.checkStiffness) {
      properties.add('E');
    }
    if (sizing.checkStrength) properties.add('strength');
    if (design.goal === 'min_cost' || spec.budgetPerPart !== null)
      properties.add('price');
    if (design.goal === 'min_carbon') properties.add('co2');
  }

  if (spec.maxPricePerKg !== null) properties.add('price');
  if (design.exchangeConstants) {
    properties.add('price');
    if (design.exchangeConstants.co2 > 0) properties.add('co2');
  }
  if (spec.tempRangeC) {
    properties.add('tMax');
    if (spec.tempRangeC[0] < 0) properties.add('tMin');
  }
  return { properties, customProperties, needsG };
}

export interface ScreenResult {
  /** Why the material is ruled out. Empty when it passes. */
  reasons: string[];
  /** Data the material lacks for the calculation. */
  missing: string[];
  /** Warnings that do not rule the material out. */
  flags: string[];
  /** The material, with G filled in when it had to be estimated. */
  material: Material;
  gEstimated: boolean;
}

export function screenMaterial(
  material: Material,
  spec: DesignSpec,
  required: RequiredData,
): ScreenResult {
  const reasons: string[] = [];
  const missing: string[] = [];
  const flags: string[] = [];
  let checked = material;
  let gEstimated = false;

  if (spec.excludeFamilies.includes(material.family))
    reasons.push(`You excluded ${FAMILY_LABEL[material.family].toLowerCase()}`);

  for (const env of spec.environment) {
    const failed: string[] = [];
    for (const { field, min } of ENV_REQUIREMENTS[env]) {
      const rating = material.ratings[field];
      if (rating === null) missing.push(`${RATING_FIELD_LABEL[field]} rating`);
      else if (!meetsRating(rating, min))
        failed.push(`${RATING_FIELD_LABEL[field]} rating ${rating}`);
    }
    if (failed.length) {
      const needed = ENV_REQUIREMENTS[env]
        .map((requirement) => requirement.min)
        .sort()
        .reverse()[0];
      const verb = material.family === 'metal' ? 'Corrodes' : 'Degrades';
      reasons.push(
        `${verb} ${ENV_LABEL[env]}: ${failed.join(', ')} (needs ${needed} or better)`,
      );
    }
  }

  for (const env of spec.customEnvironments) {
    const rating = material.customRatings[normEnv(env)];
    if (rating === null || rating === undefined)
      missing.push(`rating for “${env}”`);
    else if (!meetsRating(rating, CUSTOM_ENV_MIN))
      reasons.push(
        `Not suited to “${env}”: rating ${rating} (needs ${CUSTOM_ENV_MIN} or better)`,
      );
  }

  const badTools: string[] = [];
  for (const process of spec.requiredProcesses) {
    const rating = material.processes[process];
    if (!rating) missing.push(`rating for ${PROCESS_LABEL[process]}`);
    else if (rating === 'difficult' || rating === 'no')
      badTools.push(
        `${PROCESS_LABEL[process]} (${rating === 'no' ? 'not possible' : 'difficult'})`,
      );
  }
  if (badTools.length)
    reasons.push(`Hard to work with your tools: ${badTools.join(', ')}`);

  checkMustHaves(material, spec, reasons, missing);

  if (spec.tempRangeC) {
    const [coldest, hottest] = spec.tempRangeC;
    if (material.tMax && material.tMax[0] < hottest)
      reasons.push(
        `Maximum service temperature about ${formatNumber(material.tMax[0])}–${formatNumber(material.tMax[1])} °C; it must reliably handle ${formatNumber(hottest)} °C`,
      );
    if (coldest < 0 && material.tMin && material.tMin[1] > coldest)
      reasons.push(
        `Can become brittle or unusable below about ${formatNumber(material.tMin[1])} °C; you need ${formatNumber(coldest)} °C`,
      );
  }

  if (spec.maxPricePerKg !== null && material.price) {
    if (material.price[0] > spec.maxPricePerKg)
      reasons.push(
        `Costs at least ${formatUsd(material.price[0])}/kg, above your ${formatUsd(spec.maxPricePerKg)}/kg limit`,
      );
    else if (material.price[1] > spec.maxPricePerKg)
      flags.push(
        `Upper end of the price range (${formatUsd(material.price[1])}/kg) is above your limit`,
      );
  }

  checkPropertyLimits(material, spec, reasons, flags);

  for (const key of required.properties)
    if (material[key] === null)
      missing.push(
        `${PROPERTY_META[key].label} (${PROPERTY_META[key].symbol})`,
      );
  for (const key of required.customProperties)
    if (!material.extra?.[key]) missing.push(propertyInfo(spec, key).label);
  if (required.needsG && material.G === null) {
    if (material.E) {
      checked = {
        ...material,
        G: [material.E[0] / G_FROM_E, material.E[1] / G_FROM_E],
      };
      gEstimated = true;
      flags.push(`Shear modulus estimated as E/${G_FROM_E} (not supplied)`);
    } else missing.push(`${PROPERTY_META.G.label} (G)`);
  }

  return {
    reasons,
    missing: Array.from(new Set(missing)),
    flags,
    material: checked,
    gEstimated,
  };
}

function checkMustHaves(
  material: Material,
  spec: DesignSpec,
  reasons: string[],
  missing: string[],
) {
  const mustHave = spec.mustHave;
  if (mustHave.includes('transparent') && !material.transparent)
    reasons.push('Not transparent');
  if (
    mustHave.includes('electrical_insulator') &&
    !material.electricalInsulator
  )
    reasons.push('Conducts electricity — you need an electrical insulator');
  if (mustHave.includes('recyclable')) {
    if (!material.recyclability) missing.push('recyclability');
    else if (
      material.recyclability === 'difficult' ||
      material.recyclability === 'no'
    )
      reasons.push(
        `Hard to recycle (recyclability: ${material.recyclability === 'no' ? 'not recyclable' : 'difficult'})`,
      );
  }
  if (mustHave.includes('renewable')) {
    if (material.renewable === null || material.renewable === undefined)
      missing.push('whether it is renewable');
    else if (!material.renewable)
      reasons.push('Not made from a renewable source');
  }
  if (mustHave.includes('impact_resistant') && material.brittle)
    reasons.push('Brittle — can crack or shatter under impact');
}

// A material is ruled out only when its whole range fails a limit. A range
// that straddles the limit passes with a flag, since the right grade may meet it.
function checkPropertyLimits(
  material: Material,
  spec: DesignSpec,
  reasons: string[],
  flags: string[],
) {
  for (const limit of spec.propertyLimits) {
    // A G that will be estimated from E is not checked against the limit.
    const range =
      limit.property === 'G' && !material.G && material.E
        ? null
        : propertyRange(material, limit.property);
    if (!range) continue; // reported as missing data
    const info = propertyInfo(spec, limit.property);
    const value = withUnit(formatRange(range), info.unit);
    const why = limit.reason ? ` (${limit.reason})` : '';
    if (limit.min !== null && range[1] < limit.min)
      reasons.push(
        `${info.label} about ${value}; needs at least ${withUnit(formatNumber(limit.min), info.unit)}${why}`,
      );
    else if (limit.max !== null && range[0] > limit.max)
      reasons.push(
        `${info.label} about ${value}; needs at most ${withUnit(formatNumber(limit.max), info.unit)}${why}`,
      );
    else if (
      (limit.min !== null && range[0] < limit.min) ||
      (limit.max !== null && range[1] > limit.max)
    )
      flags.push(
        `Only part of its ${info.label.toLowerCase()} range (${value}) meets the requirement — choose the grade carefully`,
      );
  }
}
