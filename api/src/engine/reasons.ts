// The plain-language text of a result: reasons for each ranked material,
// result-level warnings and safety notes. All of it is generated from the
// numbers, so it never says anything the calculation does not support.
import {
  DesignSpec,
  Objective,
  Process,
  ProcessRating,
  RankedMaterial,
  Ratings,
  normEnv,
} from 'src/common/domain/domain.types';
import {
  PROCESS_LABEL,
  RATING_FIELD_LABEL,
  formatNumber,
  formatPercent,
  formatRange,
  formatUsd,
} from './labels';
import { ResolvedDesign } from './design';
import { Candidate } from './evaluation';
import { propertyInfo, propertyRange, withUnit } from './properties';
import { ENV_REQUIREMENTS } from './screening';

// Below this gap in chance-of-best, the top two are reported as a close call.
export const CLOSE_CALL = 0.15;

const OBJECTIVE_NAME: Record<Objective, string> = {
  balanced: 'penalty',
  min_cost: 'material cost',
  min_carbon: 'carbon footprint',
  min_mass: 'mass',
};

const PROCESSABILITY_TEXT = {
  easy: 'Easy',
  moderate: 'Moderately easy',
  hard: 'Hard',
} as const;

function formatObjective(goal: Objective, value: number): string {
  if (goal === 'min_cost' || goal === 'balanced') return formatUsd(value);
  if (goal === 'min_carbon') return `${formatNumber(value)} kg CO₂e`;
  return `${formatNumber(value)} kg`;
}

function topPickSummary(design: ResolvedDesign, top: RankedMaterial): string {
  if (design.goal === 'balanced' && top.penalty) {
    const p = top.penalty;
    return `Best balance of cost, mass and carbon: penalty about ${formatUsd(p.z)} (material ${formatUsd(p.material)} + mass ${formatUsd(p.mass)} + carbon ${formatUsd(p.carbon)})`;
  }
  if (design.goal === 'min_cost')
    return `Cheapest part that meets every requirement: about ${formatUsd(top.objectiveValue)} of material`;
  if (design.goal === 'min_carbon')
    return `Lowest-carbon part that meets every requirement: about ${formatNumber(top.objectiveValue)} kg CO₂e`;
  return `Lightest part that meets every requirement: about ${formatNumber(top.objectiveValue)} kg`;
}

/** Fills in `reasons` for every ranked material. `fitting` is in the same order as `ranking`. */
export function addReasons(
  ranking: RankedMaterial[],
  fitting: Candidate[],
  spec: DesignSpec,
  design: ResolvedDesign,
  sampleCount: number,
) {
  const top = ranking[0];
  ranking.forEach((ranked, i) => {
    const material = fitting[i].material;
    const reasons: string[] = [];

    if (design.mode === 'sizing' && ranked.sizing) {
      if (i === 0) {
        reasons.push(topPickSummary(design, ranked));
      } else {
        const ratio = ranked.objectiveValue / top.objectiveValue;
        const what = OBJECTIVE_NAME[design.goal];
        const value = formatObjective(design.goal, ranked.objectiveValue);
        reasons.push(
          ratio < 1.05
            ? `Practically the same ${what} as the top pick (${value})`
            : `About ${formatNumber(ratio, 2)}× the ${what} of the top pick (${value})`,
        );
      }
      reasons.push(`Needs a ${ranked.sizing.dimension}`);
      reasons.push(`Size is set by ${ranked.sizing.governing}`);
      if (design.goal !== 'min_cost' && ranked.sizing.costUsd)
        reasons.push(
          `Material cost about ${formatUsd(ranked.sizing.costUsd[0])}–${formatUsd(ranked.sizing.costUsd[1])}`,
        );
      if (design.goal !== 'min_mass')
        reasons.push(
          `Part mass about ${formatNumber(ranked.sizing.massKg)} kg`,
        );
      reasons.push(...ranked.sizing.notes);
    } else {
      reasons.push(
        i === 0
          ? `Highest performance index (${design.indices.map((x) => x.expression).join(', ')}) among the materials that fit`
          : `${formatNumber(ranked.objectiveValue, 2)}% of the best candidate's performance index`,
      );
    }
    if (ranking.length > 1)
      reasons.push(
        `Best choice in ${formatPercent(ranked.pBest)} of ${formatNumber(sampleCount)} simulations, top 3 in ${formatPercent(ranked.pTop3)}`,
      );

    const ratingFields = new Set<keyof Ratings>();
    for (const env of spec.environment)
      for (const requirement of ENV_REQUIREMENTS[env])
        ratingFields.add(requirement.field);
    const durability = [
      ...Array.from(ratingFields).map(
        (field) => `${RATING_FIELD_LABEL[field]} ${material.ratings[field]}`,
      ),
      ...spec.customEnvironments.map(
        (env) => `“${env}” ${material.customRatings[normEnv(env)]}`,
      ),
    ];
    if (durability.length)
      reasons.push(`Durability ratings: ${durability.join(', ')}`);

    // Show up to four of the properties the user asked about (price is shown separately).
    const asked = new Set([
      ...spec.propertyLimits.map((limit) => limit.property),
      ...(spec.component === 'custom'
        ? Object.keys(design.indices[0]?.terms ?? {})
        : []),
    ]);
    const keyProperties = Array.from(asked)
      .filter((key) => key !== 'price')
      .slice(0, 4);
    for (const key of keyProperties) {
      const range = propertyRange(material, key);
      const info = propertyInfo(spec, key);
      if (range)
        reasons.push(
          `${info.label}: about ${withUnit(formatRange(range), info.unit)}`,
        );
    }

    const footprint = ranked.footprint;
    if (footprint?.co2Kg) {
      if (footprint.basis === 'part') {
        const energy = footprint.energyMJ
          ? ` (${formatRange(footprint.energyMJ)} MJ to make)`
          : '';
        reasons.push(
          `Carbon footprint about ${formatRange(footprint.co2Kg)} kg CO₂e for this part${energy}`,
        );
      } else {
        reasons.push(
          `Carbon footprint about ${formatRange(footprint.co2Kg)} kg CO₂e per kg of material`,
        );
      }
    }

    const sustainability = ranked.sustainability;
    const sustainabilityNotes: string[] = [];
    if (sustainability.recyclability)
      sustainabilityNotes.push(`recyclability ${sustainability.recyclability}`);
    if (sustainability.renewable) sustainabilityNotes.push('renewable source');
    if (sustainability.biodegradable) sustainabilityNotes.push('biodegradable');
    if (sustainabilityNotes.length)
      reasons.push(`Sustainability: ${sustainabilityNotes.join(', ')}`);
    if (sustainability.criticalRawMaterials.length)
      reasons.push(
        `Contains EU critical raw materials: ${sustainability.criticalRawMaterials.join(', ')}`,
      );

    const processability = ranked.processability;
    if (processability.level) {
      const goodFor = processability.best.length
        ? `: good for ${processability.best
            .slice(0, 3)
            .map((p) => PROCESS_LABEL[p])
            .join(', ')}`
        : '';
      reasons.push(
        `${PROCESSABILITY_TEXT[processability.level]} to work${goodFor}`,
      );
    }
    const tools = Object.entries(ranked.processFit) as [
      Process,
      ProcessRating,
    ][];
    if (tools.length)
      reasons.push(
        `Works with your tools: ${tools.map(([process, rating]) => `${PROCESS_LABEL[process]} (${rating})`).join(', ')}`,
      );

    if (spec.tempRangeC && material.tMax && !keyProperties.includes('tMax'))
      reasons.push(
        `Rated to about ${formatNumber(material.tMax[0])}–${formatNumber(material.tMax[1])} °C`,
      );
    if (
      material.price &&
      (design.goal === 'min_cost' ||
        spec.maxPricePerKg !== null ||
        design.mode === 'index')
    )
      reasons.push(
        `Price about ${formatUsd(material.price[0])}–${formatUsd(material.price[1])} per kg`,
      );
    ranked.reasons = reasons;
  });
}

/** Warnings about the ranking as a whole. */
export function rankingWarnings(ranking: RankedMaterial[]): string[] {
  const warnings: string[] = [];
  // Only a real race counts as a close call: one of the top two must win at
  // least 20% of draws, otherwise two near-zero chances would trigger it.
  if (
    ranking.length >= 2 &&
    Math.abs(ranking[0].pBest - ranking[1].pBest) < CLOSE_CALL &&
    Math.max(ranking[0].pBest, ranking[1].pBest) >= 0.2
  ) {
    warnings.push(
      `${ranking[0].name} and ${ranking[1].name} are a close call (best in ${formatPercent(ranking[0].pBest)} vs ${formatPercent(ranking[1].pBest)} of simulations): either could be the better choice with real supplier data.`,
    );
  }

  let simulationFavourite: RankedMaterial | null = null;
  for (const ranked of ranking)
    if (!simulationFavourite || ranked.pBest > simulationFavourite.pBest)
      simulationFavourite = ranked;
  if (
    simulationFavourite &&
    simulationFavourite.rank > 1 &&
    simulationFavourite.pBest >= 0.5
  ) {
    warnings.push(
      `${simulationFavourite.name} ranks #${simulationFavourite.rank} on the conservative calculation (weak end of each property range) but comes out best in ${formatPercent(simulationFavourite.pBest)} of simulations across the full ranges. Compare supplier datasheets for it and ${ranking[0].name} before deciding.`,
    );
  }

  if (!ranking.length) {
    warnings.push(
      'No candidate met every requirement. Look at "Ruled out" to see what blocked each material, then relax the strictest requirement (tools, environment, budget or limits).',
    );
  }
  return warnings;
}

export function safetyNotes(spec: DesignSpec): string[] {
  const notes: string[] = [];
  if (spec.safetyClass !== 'general') {
    const what =
      spec.safetyClass === 'lifting' ? 'lifts loads' : 'carries people';
    notes.push(
      `This part ${what}: the result is guidance, not a certified design. Check the relevant standard and have a qualified engineer review it before use.`,
    );
  }
  if (spec.environment.includes('food_contact')) {
    notes.push(
      'For food contact, buy a grade that is certified food-safe (e.g. FDA / EU 10/2011 compliant) and confirm it with the supplier.',
    );
  }
  return notes;
}
