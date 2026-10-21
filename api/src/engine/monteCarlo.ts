import { DesignSpec, Material } from 'src/common/domain/domain.types';
import { ResolvedDesign } from './design';
import {
  Candidate,
  bestIndexValues,
  combinedScore,
  indexKey,
  penaltyPerKg,
  perKgFactor,
  sampleProperties,
  sizeForProperties,
} from './evaluation';
import { evaluateIndex } from './indices';
import { hash32, mulberry32, stableStringify } from './random';

export interface SimulationResult {
  seed: number;
  sampleCount: number;
  /** Per candidate (same order as `fitting`): how many draws it came out best. */
  bestCount: number[];
  top3Count: number[];
}

/**
 * Re-runs the ranking many times with every property drawn at random from its
 * range. Each candidate's objective per draw is appended to its `samples`.
 * The seed comes from the inputs, so the same request always gives the same result.
 */
export function simulate(
  spec: DesignSpec,
  materials: Material[],
  design: ResolvedDesign,
  fitting: Candidate[],
  requestedSamples: number,
): SimulationResult {
  // Fields that do not affect the calculation are left out of the seed.
  const seed = hash32(
    stableStringify({
      spec: {
        ...spec,
        audience: null,
        title: null,
        sourceText: null,
        assumptions: null,
      },
      materials,
    }),
  );
  const rng = mulberry32(seed);
  const sampleCount = Math.max(1, Math.floor(requestedSamples));
  const bestCount = new Array<number>(fitting.length).fill(0);
  const top3Count = new Array<number>(fitting.length).fill(0);
  const lowerIsBetter = design.mode === 'sizing';

  if (!fitting.length) return { seed, sampleCount, bestCount, top3Count };

  for (let s = 0; s < sampleCount; s++) {
    const draws = fitting.map((candidate) =>
      sampleProperties(candidate.material, rng, candidate.gEstimated),
    );
    let values: number[];
    if (design.mode === 'sizing') {
      values = draws.map((props, i) => {
        const sized = sizeForProperties(design, fitting[i].geometry!, props);
        if (!sized) return NaN;
        return sized.massKg * perKgFactor(design, props);
      });
    } else {
      const indexRows = draws.map((props) => {
        const row: Record<string, number> = {};
        for (const index of design.indices) {
          const penalty = index.terms.density
            ? penaltyPerKg(
                design,
                props.indexInputs.price,
                props.indexInputs.co2,
              )
            : 1;
          row[indexKey(index, design)] =
            evaluateIndex(index.terms, props.indexInputs) / penalty;
        }
        return row;
      });
      const best = bestIndexValues(indexRows);
      values = indexRows.map((row) => combinedScore(row, best));
    }

    values.forEach((value, i) => fitting[i].samples.push(value));
    const order = values
      .map((value, i) => ({ value, i }))
      .filter(({ value }) => Number.isFinite(value))
      .sort((a, b) => (lowerIsBetter ? a.value - b.value : b.value - a.value));
    if (order.length) bestCount[order[0].i]++;
    for (const { i } of order.slice(0, 3)) top3Count[i]++;
  }
  return { seed, sampleCount, bestCount, top3Count };
}
