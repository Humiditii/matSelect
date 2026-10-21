import {
  DesignSpec,
  Material,
  SelectionResult,
} from 'src/common/domain/domain.types';
import { FAMILY_LABEL } from 'src/engine/labels';
import {
  describeLimit,
  propertyInfo,
  propertyRange,
} from 'src/engine/properties';

// Explanations quote numbers to 3 significant figures.
const round3 = (x: number) =>
  Number.isFinite(x) ? Number(x.toPrecision(3)) : null;
const round3Range = (range: [number, number] | null) =>
  range ? [round3(range[0]), round3(range[1])] : null;

// Properties already listed under fixed names in the payload.
const BASIC_PROPERTIES = ['density', 'E', 'strength', 'tMax', 'price'];

// The other properties the brief cares about (limits and custom objective terms), keyed by "Label (unit)".
function briefProperties(spec: DesignSpec, material: Material) {
  const keys = new Set([
    ...(spec.propertyLimits ?? []).map((limit) => limit.property),
    ...(spec.customObjective?.terms.map((term) => term.property) ?? []),
  ]);
  const out: Record<string, (number | null)[] | null> = {};
  for (const key of keys) {
    if (BASIC_PROPERTIES.includes(key)) continue;
    const info = propertyInfo(spec, key);
    const label = info.unit ? `${info.label} (${info.unit})` : info.label;
    out[label] = round3Range(propertyRange(material, key));
  }
  return out;
}

// Up to 8 ruled-out materials, taken round-robin across families (fewest reasons first) so the
// "why not" section covers the everyday choices from several families.
function pickRuledOut(rejected: SelectionResult['rejected']) {
  const byFamily = new Map<string, SelectionResult['rejected']>();
  const nearestFirst = [...rejected].sort(
    (a, b) => a.reasons.length - b.reasons.length,
  );
  for (const material of nearestFirst)
    byFamily.set(material.family, [
      ...(byFamily.get(material.family) ?? []),
      material,
    ]);
  const out: SelectionResult['rejected'] = [];
  for (let i = 0; out.length < 8 && i < 10; i++)
    for (const group of byFamily.values())
      if (group[i] && out.length < 8) out.push(group[i]);
  return out;
}

// A compact view of a result for writing the explanation.
export function buildPayload(result: SelectionResult) {
  const spec = result.spec;
  const sized = result.mode === 'sizing';
  const materialsById = new Map(result.materials.map((m) => [m.id, m]));

  return {
    design: {
      title: spec.title,
      component: spec.component,
      objective: spec.objective,
      criteria: spec.criteria,
      load: spec.load,
      length: spec.length,
      maxDeflection: spec.maxDeflection,
      maxTwistDeg: spec.maxTwistDeg,
      support: spec.component === 'beam' ? spec.support : undefined,
      endCondition: spec.component === 'column' ? spec.endCondition : undefined,
      // Section and safety factor only mean something when the part is sized.
      section: sized ? spec.section : undefined,
      sectionWidth: sized ? spec.sectionWidth : undefined,
      environment: spec.environment,
      otherConditions: spec.customEnvironments,
      tempRangeC: spec.tempRangeC,
      tools: spec.requiredProcesses,
      mustHave: spec.mustHave,
      safetyClass: spec.safetyClass,
      assumptions: spec.assumptions,
      function: spec.function || undefined,
      requirements: (spec.propertyLimits ?? []).map((limit) =>
        describeLimit(spec, limit),
      ),
    },
    mode: result.mode,
    objective: {
      label: result.objectiveLabel,
      unit: result.objectiveUnit,
      lowerIsBetter: result.lowerIsBetter,
    },
    index: result.index,
    safetyFactor: sized ? result.safetyFactor : undefined,
    constraints: result.activeConstraints,
    monteCarloSamples: result.mcSamples,
    counts: {
      considered: result.materials.length,
      fit: result.ranking.length,
      ruledOut: result.rejected.length,
      notEvaluated: result.notEvaluated.length + result.invalidData.length,
    },
    ranked: result.ranking.slice(0, 5).map((ranked) => {
      const material = materialsById.get(ranked.materialId);
      return {
        rank: ranked.rank,
        name: ranked.name,
        grade: ranked.grade,
        family: FAMILY_LABEL[ranked.family],
        confidence: ranked.confidence,
        objectiveValue: round3(ranked.objectiveValue),
        likelyRangeP10P90: round3Range(ranked.objectiveInterval),
        chanceBestPercent: Math.round(ranked.pBest * 100),
        chanceTop3Percent: Math.round(ranked.pTop3 * 100),
        size: ranked.sizing
          ? {
              description: ranked.sizing.dimension,
              sizeMm: round3(ranked.sizing.sizeMm),
              massKg: round3(ranked.sizing.massKg),
              materialCostUsd: round3Range(ranked.sizing.costUsd),
              governedBy: ranked.sizing.governing,
            }
          : null,
        reasons: ranked.reasons,
        tools: ranked.processFit,
        dataFlags: ranked.dataFlags,
        properties: material
          ? {
              density_kg_m3: round3Range(material.density),
              E_GPa: round3Range(material.E),
              strength_MPa: round3Range(material.strength),
              maxServiceTemp_C: round3Range(material.tMax),
              price_USD_per_kg: round3Range(material.price),
              forms: material.forms,
              ...briefProperties(spec, material),
            }
          : null,
        references: material?.sources ?? [],
        footprint: ranked.footprint
          ? {
              basis:
                ranked.footprint.basis === 'part'
                  ? 'for this part'
                  : 'per kg of material',
              co2_kgCO2e: round3Range(ranked.footprint.co2Kg),
              energy_MJ: round3Range(ranked.footprint.energyMJ),
            }
          : null,
        sustainability: ranked.sustainability
          ? {
              recyclability: ranked.sustainability.recyclability,
              renewable: ranked.sustainability.renewable,
              biodegradable: ranked.sustainability.biodegradable,
              euCriticalRawMaterials:
                ranked.sustainability.criticalRawMaterials,
            }
          : null,
        processability: ranked.processability?.level ?? null,
      };
    }),
    ruledOut: pickRuledOut(result.rejected).map((rejected) => ({
      name: rejected.name,
      family: FAMILY_LABEL[rejected.family],
      reasons: rejected.reasons,
    })),
    warnings: result.warnings,
    safetyNotes: result.safetyNotes,
  };
}
export type ExplanationPayload = ReturnType<typeof buildPayload>;
