// runSelection turns a design spec and candidate materials into a ranked result.
// Claude never ranks or filters: which materials fit, and in what order, is
// decided here from the numbers.
import {
  DesignSpec,
  ExcludedMaterial,
  IndexInfo,
  Material,
  Process,
  ProcessRating,
  RankedMaterial,
  Range,
  SelectionResult,
} from 'src/common/domain/domain.types';
import { footprintOf, penaltyOf, tradeoffOf } from './chartData';
import { ResolvedDesign, resolveDesign } from './design';
import {
  Candidate,
  evaluateCandidates,
  excluded,
  nominalProperties,
} from './evaluation';
import { FAMILY_LABEL, SECTION_LABEL } from './labels';
import { simulate } from './monteCarlo';
import { NO_TUBE_FAMILIES, sectionGeometry, solidEquivalent } from './section';
import { percentile } from './random';
import { addReasons, rankingWarnings, safetyNotes } from './reasons';
import { requiredData, screenMaterial } from './screening';
import { processabilityOf, sustainabilityOf } from './sustainability';
import { validateMaterials } from './validate';

export interface EngineOptions {
  mcSamples: number;
}

export type EngineResult = Omit<
  SelectionResult,
  'id' | 'createdAt' | 'explanations' | 'timingsMs' | 'dataSource'
>;

export function runSelection(
  spec: DesignSpec,
  materials: Material[],
  opts: EngineOptions,
): EngineResult {
  const design = resolveDesign(spec);
  const warnings = [...design.warnings];
  const lowerIsBetter = design.mode === 'sizing';

  const validation = validateMaterials(materials);
  if (validation.duplicatesRemoved.length)
    warnings.push(
      `Removed ${validation.duplicatesRemoved.length} duplicate candidate(s): ${validation.duplicatesRemoved.join(', ')}.`,
    );

  const required = requiredData(spec, design);
  const rejected: ExcludedMaterial[] = [];
  const notEvaluated: ExcludedMaterial[] = [];
  const candidates: Candidate[] = [];
  for (const original of validation.valid) {
    const screened = screenMaterial(original, spec, required);
    if (screened.reasons.length) {
      rejected.push(excluded(original, screened.reasons));
      continue;
    }
    if (screened.missing.length) {
      notEvaluated.push(
        excluded(original, [`Missing data: ${screened.missing.join(', ')}`]),
      );
      continue;
    }
    const material = screened.material;
    candidates.push({
      material,
      gEstimated: screened.gEstimated,
      flags: [...(validation.flags.get(material.id) ?? []), ...screened.flags],
      ...geometryFor(spec, design, material),
      nominal: nominalProperties(material),
      objective: NaN,
      sizing: null,
      indexValues: {},
      samples: [],
    });
  }

  const fitting = evaluateCandidates(
    spec,
    design,
    candidates,
    rejected,
    notEvaluated,
  );
  fitting.sort(
    (a, b) =>
      (lowerIsBetter ? a.objective - b.objective : b.objective - a.objective) ||
      a.material.name.localeCompare(b.material.name),
  );

  const simulation = simulate(spec, materials, design, fitting, opts.mcSamples);
  const sampleCount = simulation.sampleCount;
  const tradeoffs = tradeoffOf(design, fitting);

  const ranking: RankedMaterial[] = fitting.map((candidate, i) => {
    const material = candidate.material;
    const sorted = candidate.samples
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    const interval: Range = [percentile(sorted, 0.1), percentile(sorted, 0.9)];
    const processFit: Partial<Record<Process, ProcessRating>> = {};
    for (const process of spec.requiredProcesses)
      if (material.processes[process])
        processFit[process] = material.processes[process];
    return {
      rank: i + 1,
      materialId: material.id,
      name: material.name,
      family: material.family,
      grade: material.grade,
      confidence: material.confidence,
      objectiveValue: candidate.objective,
      objectiveInterval: interval,
      pBest: simulation.bestCount[i] / sampleCount,
      pTop3: simulation.top3Count[i] / sampleCount,
      indexValues: candidate.indexValues,
      sizing: candidate.sizing,
      processFit,
      footprint: footprintOf(material, candidate.sizing),
      tradeoff: tradeoffs[i],
      penalty: penaltyOf(design, candidate),
      sustainability: sustainabilityOf(material),
      processability: processabilityOf(material),
      reasons: [],
      dataFlags: Array.from(new Set(candidate.flags)),
    };
  });
  addReasons(ranking, fitting, spec, design, sampleCount);
  warnings.push(...rankingWarnings(ranking));

  const index: IndexInfo = {
    expression: design.indices.map((x) => x.expression).join(' and '),
    description: design.indices.map((x) => x.description).join('; '),
    cost: design.goal === 'min_cost',
  };
  const objective = describeObjective(design);

  return {
    spec,
    mode: design.mode,
    objectiveLabel: objective.label,
    objectiveUnit: objective.unit,
    lowerIsBetter,
    index,
    safetyFactor: design.safetyFactor,
    activeConstraints: design.activeConstraints,
    ranking,
    rejected,
    notEvaluated,
    invalidData: validation.invalid,
    materials,
    warnings,
    safetyNotes: safetyNotes(spec),
    mcSamples: sampleCount,
    seed: simulation.seed,
  };
}

// Families not sold as tube (wood, ceramics, foams) are sized as the solid
// equivalent of the chosen tube, with a note saying so.
function geometryFor(
  spec: DesignSpec,
  design: ResolvedDesign,
  material: Material,
): Pick<Candidate, 'geometry' | 'sectionNotes'> {
  const geometry = design.geometry;
  if (
    !geometry ||
    !geometry.tubeRatio ||
    !NO_TUBE_FAMILIES.includes(material.family)
  )
    return { geometry, sectionNotes: [] };
  const solid = solidEquivalent(geometry.section);
  return {
    geometry: sectionGeometry(solid, spec.tubeRatio, geometry.widthM),
    sectionNotes: [
      `Sized as a ${SECTION_LABEL[solid]}: ${FAMILY_LABEL[material.family].toLowerCase()} are not normally sold as tube`,
    ],
  };
}

function describeObjective(design: ResolvedDesign): {
  label: string;
  unit: string;
} {
  if (design.mode !== 'sizing')
    return {
      label: 'Performance index, as % of the best candidate',
      unit: '%',
    };
  switch (design.goal) {
    case 'balanced':
      return {
        label:
          'Lowest penalty Z of the part (material cost + value of mass + value of carbon)',
        unit: 'USD eq.',
      };
    case 'min_cost':
      return { label: 'Lowest material cost of the part', unit: 'USD' };
    case 'min_carbon':
      return { label: 'Lowest carbon footprint of the part', unit: 'kg CO₂e' };
    default:
      return { label: 'Lowest mass of the part', unit: 'kg' };
  }
}
