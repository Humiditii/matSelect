// Numbers behind the result charts: carbon footprint, the balanced-goal
// penalty breakdown and each material's place on the trade-off chart.
import { Material, Sizing } from 'src/common/domain/domain.types';
import { ResolvedDesign } from './design';
import {
  Candidate,
  bestIndexValues,
  combinedScore,
  nominalIndexValue,
} from './evaluation';
import { scaleRange } from './sustainability';

/** Carbon and energy for the sized part, or per kg when the part isn't sized. */
export function footprintOf(material: Material, sizing: Sizing | null) {
  if (!material.co2 && !material.embodiedEnergy) return null;
  const massKg = sizing ? sizing.massKg : 1;
  return {
    basis: sizing ? ('part' as const) : ('kg' as const),
    co2Kg: scaleRange(material.co2 ?? null, massKg),
    energyMJ: scaleRange(material.embodiedEnergy ?? null, massKg),
  };
}

/** Penalty breakdown for a sized part under the balanced goal, from nominal values. */
export function penaltyOf(design: ResolvedDesign, candidate: Candidate) {
  const constants = design.exchangeConstants;
  if (!constants || !candidate.sizing) return null;
  const massKg = candidate.sizing.massKg;
  const material = massKg * candidate.nominal.price;
  const mass = constants.mass * massKg;
  const carbon =
    constants.co2 > 0 ? constants.co2 * massKg * candidate.nominal.co2 : 0;
  return {
    z: material + mass + carbon,
    material,
    mass,
    carbon,
    alphaMass: constants.mass,
    alphaCo2: constants.co2,
  };
}

const finiteOrNull = (x: number) => (Number.isFinite(x) ? x : null);

/**
 * Where each material sits on the trade-off chart.
 * Sized parts use the part's mass, material cost and carbon. In index mode the
 * mass is relative to the lightest candidate for the same performance (from
 * the mass-based indices), times price and CO₂ per kg. There is no point when
 * the index does not depend on mass (for example a flexure hinge).
 */
export function tradeoffOf(design: ResolvedDesign, fitting: Candidate[]) {
  if (design.mode === 'sizing')
    return fitting.map((candidate) =>
      candidate.sizing
        ? {
            basis: 'part' as const,
            mass: candidate.sizing.massKg,
            cost: finiteOrNull(
              candidate.sizing.massKg * candidate.nominal.price,
            ),
            co2: finiteOrNull(candidate.sizing.massKg * candidate.nominal.co2),
          }
        : null,
    );

  const massIndices = design.massIndices;
  if (
    !massIndices.length ||
    !massIndices.every((index) => index.terms.density === -1)
  )
    return fitting.map(() => null);

  const values = fitting.map((candidate) => {
    const row: Record<string, number> = {};
    for (const index of massIndices)
      row[index.expression] = nominalIndexValue(candidate.material, index);
    return row;
  });
  const best = bestIndexValues(values);
  return fitting.map((candidate, i) => {
    const score = combinedScore(values[i], best);
    if (!Number.isFinite(score) || score <= 0) return null;
    const relativeMass = 100 / score; // 1 = lightest for the same performance
    return {
      basis: 'relative' as const,
      mass: relativeMass,
      cost: finiteOrNull(relativeMass * candidate.nominal.price),
      co2: finiteOrNull(relativeMass * candidate.nominal.co2),
    };
  });
}
