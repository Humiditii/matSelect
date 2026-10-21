/**
 * Explanation payload (§6.5) and the grounding check: every number in an explanation must come from the payload.
 */
import { SelectionResult } from 'src/common/domain/domain.types';
import { FAMILY_LABEL } from 'src/engine/labels';
import { describeLimit, propMeta, propRange } from 'src/engine/pipeline';

const r3 = (x: number) =>
  Number.isFinite(x) ? Number(x.toPrecision(3)) : null;
const r3r = (r: [number, number] | null) => (r ? [r3(r[0]), r3(r[1])] : null);

/** Compact, explanation-ready view of a result. Numbers are rounded to 3 significant figures. */
export function buildPayload(res: SelectionResult) {
  const s = res.spec;
  const byId = new Map(res.materials.map((m) => [m.id, m]));
  const pickRejected = () => {
    // Round-robin across families so the "why not" covers the everyday choices from different families.
    const groups = new Map<string, typeof res.rejected>();
    const nearest = [...res.rejected].sort(
      (a, b) => a.reasons.length - b.reasons.length,
    );
    for (const r of nearest)
      groups.set(r.family, [...(groups.get(r.family) ?? []), r]);
    const out: typeof res.rejected = [];
    for (let i = 0; out.length < 8 && i < 10; i++)
      for (const g of groups.values())
        if (g[i] && out.length < 8) out.push(g[i]);
    return out;
  };

  return {
    design: {
      title: s.title,
      component: s.component,
      objective: s.objective,
      criteria: s.criteria,
      load: s.load,
      length: s.length,
      maxDeflection: s.maxDeflection,
      maxTwistDeg: s.maxTwistDeg,
      support: s.component === 'beam' ? s.support : undefined,
      endCondition: s.component === 'column' ? s.endCondition : undefined,
      // Section and safety factor only mean something when the part is sized.
      section: res.mode === 'sizing' ? s.section : undefined,
      sectionWidth: res.mode === 'sizing' ? s.sectionWidth : undefined,
      environment: s.environment,
      otherConditions: s.customEnvironments,
      tempRangeC: s.tempRangeC,
      tools: s.requiredProcesses,
      mustHave: s.mustHave,
      safetyClass: s.safetyClass,
      assumptions: s.assumptions,
      function: s.function || undefined,
      requirements: (s.propertyLimits ?? []).map((l) => describeLimit(s, l)),
    },
    mode: res.mode,
    objective: {
      label: res.objectiveLabel,
      unit: res.objectiveUnit,
      lowerIsBetter: res.lowerIsBetter,
    },
    index: res.index,
    safetyFactor: res.mode === 'sizing' ? res.safetyFactor : undefined,
    constraints: res.activeConstraints,
    monteCarloSamples: res.mcSamples,
    counts: {
      considered: res.materials.length,
      fit: res.ranking.length,
      ruledOut: res.rejected.length,
      notEvaluated: res.notEvaluated.length + res.invalidData.length,
    },
    ranked: res.ranking.slice(0, 5).map((r) => {
      const m = byId.get(r.materialId);
      return {
        rank: r.rank,
        name: r.name,
        grade: r.grade,
        family: FAMILY_LABEL[r.family],
        confidence: r.confidence,
        objectiveValue: r3(r.objectiveValue),
        likelyRangeP10P90: r3r(r.objectiveInterval),
        chanceBestPercent: Math.round(r.pBest * 100),
        chanceTop3Percent: Math.round(r.pTop3 * 100),
        size: r.sizing
          ? {
              description: r.sizing.dimension,
              sizeMm: r3(r.sizing.sizeMm),
              massKg: r3(r.sizing.massKg),
              materialCostUsd: r3r(r.sizing.costUsd),
              governedBy: r.sizing.governing,
            }
          : null,
        reasons: r.reasons,
        tools: r.processFit,
        dataFlags: r.dataFlags,
        properties: m
          ? {
              density_kg_m3: r3r(m.density),
              E_GPa: r3r(m.E),
              strength_MPa: r3r(m.strength),
              maxServiceTemp_C: r3r(m.tMax),
              price_USD_per_kg: r3r(m.price),
              forms: m.forms,
              ...Object.fromEntries(
                Array.from(
                  new Set([
                    ...(s.propertyLimits ?? []).map((l) => l.property),
                    ...(s.customObjective?.terms.map((t) => t.property) ?? []),
                  ]),
                )
                  .filter(
                    (k) =>
                      !['density', 'E', 'strength', 'tMax', 'price'].includes(
                        k,
                      ),
                  )
                  .map((k) => [
                    `${propMeta(s, k).label}${propMeta(s, k).unit ? ` (${propMeta(s, k).unit})` : ''}`,
                    r3r(propRange(m, k)),
                  ]),
              ),
            }
          : null,
        references: m?.sources ?? [],
        footprint: r.footprint
          ? {
              basis:
                r.footprint.basis === 'part'
                  ? 'for this part'
                  : 'per kg of material',
              co2_kgCO2e: r3r(r.footprint.co2Kg),
              energy_MJ: r3r(r.footprint.energyMJ),
            }
          : null,
        sustainability: r.sustainability
          ? {
              recyclability: r.sustainability.recyclability,
              renewable: r.sustainability.renewable,
              biodegradable: r.sustainability.biodegradable,
              euCriticalRawMaterials: r.sustainability.criticalRawMaterials,
            }
          : null,
        processability: r.processability?.level ?? null,
      };
    }),
    ruledOut: pickRejected().map((r) => ({
      name: r.name,
      family: FAMILY_LABEL[r.family],
      reasons: r.reasons,
    })),
    warnings: res.warnings,
    safetyNotes: res.safetyNotes,
  };
}
export type ExplanationPayload = ReturnType<typeof buildPayload>;

// ---------------------------------------------------------------------------
// Number extraction
// ---------------------------------------------------------------------------
const UNIT_GLUE =
  /(\d)(mm|cm|km|kg|kN|N|m|MPa|GPa|°C|°|%|x|×|USD|s)(?![A-Za-z0-9])/g;
/** Tokens mixing letters and digits are names/grades/labels (6061-T6, S355, PA66, p10, Ti-6Al-4V), not quantities. */
const GRADE_TOKEN =
  /(?<![\w.])(?=[\w\-/.]*[A-Za-z])(?=[\w\-/.]*\d)[A-Za-z0-9]+(?:[-/.][A-Za-z0-9]+)*(?![\w])/g;
const NUMBER = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** All numeric values written in a piece of text, ignoring the given names and any grade-like tokens. */
export function extractNumbers(
  text: string,
  ignoreTerms: string[] = [],
): { raw: string; value: number }[] {
  let t = text;
  for (const term of [...ignoreTerms]
    .filter((x) => x && /\d/.test(x))
    .sort((a, b) => b.length - a.length)) {
    t = t.replace(new RegExp(escapeRe(term), 'gi'), ' ');
  }
  t = t.replace(UNIT_GLUE, '$1 $2');
  t = t.replace(GRADE_TOKEN, ' ');
  // Superscripts/exponent notation in units (m³, m², 10^3) are not quantities.
  t = t.replace(/[²³¹⁰⁴⁵⁶⁷⁸⁹]/g, ' ').replace(/\^\(?[\d/]+\)?/g, ' ');
  const out: { raw: string; value: number }[] = [];
  for (const m of t.matchAll(NUMBER))
    out.push({ raw: m[0], value: Number(m[0].replace(/,/g, '')) });
  return out;
}

/** Every number in the payload: numeric fields plus numbers written inside its strings. */
export function payloadNumbers(payload: unknown): number[] {
  const out: number[] = [];
  const walk = (v: unknown) => {
    if (typeof v === 'number' && Number.isFinite(v)) out.push(v);
    else if (typeof v === 'string')
      for (const n of extractNumbers(v)) out.push(n.value);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(payload);
  return out;
}

const SCALES = [1, 100, 0.01, 1000, 0.001];

function matches(x: number, raw: string, p: number): boolean {
  const a = Math.abs(p);
  for (const k of SCALES) {
    const target = a * k;
    if (target === 0) {
      if (x === 0) return true;
      continue;
    }
    if (Math.abs(x - target) <= 0.05 * target) return true;
    // Rounded to the precision written (e.g. "0.02" for 0.0249).
    const decimals = raw.includes('.') ? raw.split('.')[1].length : 0;
    if (Number(target.toFixed(decimals)) === x) return true;
  }
  return false;
}

export interface GroundingResult {
  grounded: boolean;
  unverifiedNumbers: string[];
}

/**
 * Each number in `text` must match a payload number within 5% (or ×100 for percentages, ×1000 / ÷1000
 * for unit changes). Small integers ≤ 10 and material names/grades are ignored.
 */
export function checkGrounding(
  text: string,
  payload: unknown,
  ignoreTerms: string[] = [],
): GroundingResult {
  const nums = payloadNumbers(payload);
  const bad = new Set<string>();
  for (const { raw, value } of extractNumbers(text, ignoreTerms)) {
    if (Number.isInteger(value) && value <= 10) continue;
    if (!nums.some((p) => matches(value, raw, p))) bad.add(raw);
  }
  return { grounded: bad.size === 0, unverifiedNumbers: [...bad] };
}

/** Material names and grades to ignore when extracting numbers. */
export function ignoreTermsFor(res: SelectionResult): string[] {
  const terms = new Set<string>();
  for (const m of res.materials) {
    terms.add(m.name);
    if (m.grade) terms.add(m.grade);
  }
  return [...terms];
}
