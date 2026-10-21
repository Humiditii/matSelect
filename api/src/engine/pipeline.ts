/**
 * runSelection(spec, materials) → deterministic engine result (§6.4).
 *
 * Claude never ranks or filters: fit and order are decided here, from the numbers.
 * Steps: resolve design → plausibility → screening → nominal evaluation (sizing or index)
 *        → Monte Carlo uncertainty → ranking → code-generated reasons, warnings, safety notes.
 */
import {
  DEFAULT_SAFETY_FACTORS,
  DesignSpec,
  Environment,
  ExcludedMaterial,
  IndexInfo,
  Material,
  Mode,
  PROPERTY_META,
  Process,
  ProcessRating,
  PropertyLimit,
  RankedMaterial,
  Range,
  RATINGS,
  Rating,
  Ratings,
  SelectionResult,
  Sizing,
  normEnv,
} from 'src/common/domain/domain.types';
import {
  ENV_LABEL,
  FAMILY_LABEL,
  MUST_HAVE_LABEL,
  PROCESS_LABEL,
  RATING_FIELD_LABEL,
  SECTION_LABEL,
  fmt,
  fmtRange,
  fmtUsd,
  pct,
} from './labels';
import {
  ConstraintKey,
  GOVERNING_TEXT,
  IndexDef,
  IndexTerms,
  MASSLESS_INDEX,
  NO_TUBE_FAMILIES,
  SectionGeometry,
  SizingCase,
  area,
  deriveIndices,
  describeSection,
  evaluateIndex,
  formatMm,
  sectionGeometry,
  sizePart,
  solidEquivalent,
} from './physics';
import {
  geoMean,
  hash32,
  mulberry32,
  percentile,
  sampleRange,
  stableStringify,
} from './random';
import {
  UnitError,
  isTorqueUnit,
  toMetres,
  toNewtonMetres,
  toNewtons,
  SUPPORTED_UNITS,
} from './units';
import { validateMaterials } from './validate';

export interface EngineOptions {
  mcSamples: number;
}

export type EngineResult = Omit<
  SelectionResult,
  'id' | 'createdAt' | 'explanations' | 'timingsMs' | 'dataSource'
>;

/** DECISION: plank width when the user chose "board" but gave no width (typical shelf board). */
export const DEFAULT_BOARD_WIDTH_MM = 200;
/** G ≈ E/2.6 (Poisson's ratio ≈ 0.3) when only E is known — the one flagged imputation. */
export const G_FROM_E = 2.6;
/** pBest gap (fraction) below which the top two are reported as "either could be best". */
export const CLOSE_CALL = 0.15;
const GPA = 1e9;
const MPA = 1e6;

const isStd = (k: string): k is keyof typeof PROPERTY_META =>
  k in PROPERTY_META;

/** Label, unit and symbol of a standard or custom property. */
export function propMeta(
  spec: DesignSpec,
  key: string,
): { label: string; unit: string; symbol: string } {
  if (isStd(key)) return PROPERTY_META[key];
  const c = spec.customProperties?.find((p) => p.key === key);
  return {
    label: c?.label ?? key,
    unit: c?.unit ?? '',
    symbol: c?.symbol || c?.label || key,
  };
}

/** A material's [min, max] for a standard or custom property, or null if unknown. */
export function propRange(m: Material, key: string): Range | null {
  if (isStd(key)) return m[key];
  return m.extra?.[key] ?? null;
}

const withUnit = (x: string, unit: string) => (unit ? `${x} ${unit}` : x);

export function describeLimit(spec: DesignSpec, l: PropertyLimit): string {
  const meta = propMeta(spec, l.property);
  const bound =
    l.min !== null && l.max !== null
      ? `between ${fmt(l.min)} and ${withUnit(fmt(l.max), meta.unit)}`
      : l.min !== null
        ? `at least ${withUnit(fmt(l.min), meta.unit)}`
        : `at most ${withUnit(fmt(l.max!), meta.unit)}`;
  return `${meta.label} ${bound}${l.reason ? ` — ${l.reason}` : ''}`;
}

// ---------------------------------------------------------------------------
// Design resolution
// ---------------------------------------------------------------------------
interface ResolvedDesign {
  sf: number;
  mode: Mode;
  sizing: SizingCase | null;
  geometry: SectionGeometry | null;
  indices: IndexDef[];
  warnings: string[];
  activeConstraints: string[];
  costObjective: boolean;
}

const SIZING_COMPONENTS = ['beam', 'tie', 'column', 'shaft'] as const;
type SizingComponent = (typeof SIZING_COMPONENTS)[number];
const isSizingComponent = (c: string): c is SizingComponent =>
  (SIZING_COMPONENTS as readonly string[]).includes(c);

const SUPPORT_TEXT = {
  simply_supported_center: 'supported at both ends, load at the centre',
  simply_supported_uniform: 'supported at both ends, load spread evenly',
  cantilever_end: 'fixed at one end, load at the free end',
} as const;
const END_TEXT = {
  pinned_pinned: 'both ends pinned',
  fixed_free: 'one end fixed, other end free',
  fixed_fixed: 'both ends fixed',
  fixed_pinned: 'one end fixed, other pinned',
} as const;

const q = (x: { value: number; unit: string }) => `${fmt(x.value)} ${x.unit}`;

export function resolveDesign(spec: DesignSpec): ResolvedDesign {
  const warnings: string[] = [];
  const active: string[] = [];
  const defaultSf = DEFAULT_SAFETY_FACTORS[spec.safetyClass];
  const sf = spec.safetyFactor ?? defaultSf;
  if (spec.safetyFactor !== null && spec.safetyFactor < defaultSf) {
    warnings.push(
      `Your safety factor ${fmt(sf)} is lower than the usual ${fmt(defaultSf)} for this use (${spec.safetyClass.replace('_', ' ')}). Parts will be thinner and closer to failure.`,
    );
  }

  let costObjective = spec.objective === 'min_cost';
  if (costObjective && MASSLESS_INDEX.includes(spec.component)) {
    warnings.push(
      'The goal "cheapest" does not change this ranking: the index for this part does not depend on how much material is used.',
    );
    costObjective = false;
  }

  let section = spec.section;
  let widthM: number | null = null;
  if (
    spec.component === 'shaft' &&
    section !== 'solid_round' &&
    section !== 'round_tube'
  ) {
    warnings.push(
      `Shafts are sized as round sections; "${SECTION_LABEL[section]}" was changed to a solid round bar.`,
    );
    section = 'solid_round';
  }
  if (section === 'rect_fixed_width') {
    if (spec.sectionWidth) widthM = toMetres(spec.sectionWidth, 'sectionWidth');
    else {
      widthM = DEFAULT_BOARD_WIDTH_MM / 1000;
      warnings.push(
        `No board width was given, so ${DEFAULT_BOARD_WIDTH_MM} mm was assumed.`,
      );
    }
  }

  const symbols = Object.fromEntries(
    spec.customProperties.map((p) => [p.key, p.symbol || p.label]),
  );
  const custom =
    spec.component === 'custom'
      ? {
          terms: Object.fromEntries(
            (spec.customObjective?.terms ?? []).map((t) => [
              t.property,
              t.exponent,
            ]),
          ) as IndexTerms,
          description: spec.customObjective?.description ?? '',
          symbols,
        }
      : null;
  const indices = deriveIndices(
    spec.component,
    spec.criteria,
    section,
    costObjective ? 'min_cost' : 'min_mass',
    custom,
  );

  // ---- Sizing mode? -------------------------------------------------------
  let sizing: SizingCase | null = null;
  let geometry: SectionGeometry | null = null;
  const comp = spec.component;

  if (isSizingComponent(comp)) {
    if (spec.load && spec.length) {
      const torque = isTorqueUnit(spec.load.unit);
      if (comp === 'shaft' && !torque)
        throw new UnitError(
          'load (shaft torque)',
          spec.load.unit,
          SUPPORTED_UNITS.torque,
        );
      if (comp !== 'shaft' && torque)
        throw new UnitError('load', spec.load.unit, SUPPORTED_UNITS.force);
      const load =
        comp === 'shaft' ? toNewtonMetres(spec.load) : toNewtons(spec.load);
      const L = toMetres(spec.length, 'length');
      const defl = spec.maxDeflection
        ? toMetres(spec.maxDeflection, 'maxDeflection')
        : null;
      const twist =
        spec.maxTwistDeg !== null ? (spec.maxTwistDeg * Math.PI) / 180 : null;
      const wantsStiff = spec.criteria.includes('stiffness');
      const wantsStrong = spec.criteria.includes('strength');

      let checkStiffness: boolean;
      let checkStrength: boolean;
      if (comp === 'column') {
        checkStiffness = true; // DECISION: buckling and crushing are both failure modes; always checked.
        checkStrength = true;
      } else {
        const limit = comp === 'shaft' ? twist : defl;
        checkStiffness = wantsStiff && limit !== null;
        checkStrength = wantsStrong;
        if (wantsStiff && limit === null) {
          const what =
            comp === 'shaft'
              ? 'maximum twist'
              : comp === 'tie'
                ? 'maximum stretch'
                : 'maximum bending (deflection)';
          warnings.push(
            checkStrength
              ? `Stiffness was not checked because no ${what} was given — only strength sets the size.`
              : `No ${what} was given, so parts could not be sized for stiffness.`,
          );
        }
      }

      if (checkStiffness || checkStrength) {
        sizing = {
          component: comp,
          load,
          lengthM: L,
          safetyFactor: sf,
          maxDeflectionM: defl,
          maxTwistRad: twist,
          support: spec.support,
          endCondition: spec.endCondition,
          checkStiffness,
          checkStrength,
        };
        geometry = sectionGeometry(section, spec.tubeRatio, widthM);

        const loadText = q(spec.load);
        const lenText = q(spec.length);
        if (comp === 'beam') {
          active.push(
            `Beam ${lenText} long, ${SUPPORT_TEXT[spec.support]}, carrying ${loadText}`,
          );
          if (checkStiffness)
            active.push(
              `Bends no more than ${q(spec.maxDeflection!)} under the load`,
            );
          if (checkStrength)
            active.push(
              `Bending stress stays below strength ÷ ${fmt(sf)} (safety factor)`,
            );
        } else if (comp === 'tie') {
          active.push(`Tie ${lenText} long, pulled with ${loadText}`);
          if (checkStiffness)
            active.push(`Stretches no more than ${q(spec.maxDeflection!)}`);
          if (checkStrength)
            active.push(
              `Tensile stress stays below strength ÷ ${fmt(sf)} (safety factor)`,
            );
        } else if (comp === 'column') {
          active.push(
            `Column ${lenText} long (${END_TEXT[spec.endCondition]}), carrying ${loadText}`,
          );
          active.push(
            `Does not buckle at ${fmt(sf)} × the load (Euler buckling)`,
          );
          active.push(`Does not crush: stress below strength ÷ ${fmt(sf)}`);
        } else {
          active.push(
            `Shaft ${lenText} long, transmitting ${loadText} of torque`,
          );
          if (checkStiffness)
            active.push(`Twists no more than ${fmt(spec.maxTwistDeg!)}°`);
          if (checkStrength)
            active.push(
              `Shear stress stays below strength ÷ (√3 × ${fmt(sf)})`,
            );
        }
        active.push(`Section: ${describeSectionChoice(geometry)}`);
      }
    }
    if (!sizing) {
      const missing = [
        !spec.load && 'the load',
        !spec.length && (comp === 'beam' ? 'the span' : 'the length'),
      ].filter(Boolean);
      warnings.push(
        missing.length
          ? `Ranked by performance index only because ${missing.join(' and ')} ${missing.length > 1 ? 'were' : 'was'} not given. Add them to get part sizes, masses and costs.`
          : 'Ranked by performance index only because no limit could be checked. Add a deflection/twist limit or the strength criterion to size the part.',
      );
    }
  }

  // ---- Screening constraints, stated for the user ------------------------
  for (const l of spec.propertyLimits) active.push(describeLimit(spec, l));
  if (spec.tempRangeC)
    active.push(
      `Works from ${fmt(spec.tempRangeC[0])} °C to ${fmt(spec.tempRangeC[1])} °C`,
    );
  for (const env of spec.environment) {
    const req = ENV_REQUIREMENTS[env];
    if (req.length)
      active.push(
        `Durable ${ENV_LABEL[env]}: ${req.map((r) => `${RATING_FIELD_LABEL[r.field]} rating ${r.min} or better`).join(', ')}`,
      );
  }
  for (const env of spec.customEnvironments)
    active.push(`Suited to “${env}”: rating ${CUSTOM_ENV_MIN} or better`);
  if (spec.requiredProcesses.length)
    active.push(
      `Workable with your tools: ${spec.requiredProcesses.map((p) => PROCESS_LABEL[p]).join(', ')} (rated good or possible)`,
    );
  for (const mh of spec.mustHave) active.push(`Must be ${MUST_HAVE_LABEL[mh]}`);
  if (spec.excludeFamilies.length)
    active.push(
      `Excluded: ${spec.excludeFamilies.map((f) => FAMILY_LABEL[f]).join(', ')}`,
    );
  if (spec.maxPricePerKg !== null)
    active.push(`Material price at most ${fmtUsd(spec.maxPricePerKg)}/kg`);
  if (spec.budgetPerPart !== null) {
    if (sizing)
      active.push(
        `Material cost of the part at most ${fmtUsd(spec.budgetPerPart)}`,
      );
    else
      warnings.push(
        'The budget per part could not be checked because the part was not sized.',
      );
  }

  return {
    sf,
    mode: sizing ? 'sizing' : 'index',
    sizing,
    geometry,
    indices,
    warnings,
    activeConstraints: active,
    costObjective,
  };
}

function describeSectionChoice(g: SectionGeometry): string {
  if (g.section === 'rect_fixed_width')
    return `board ${formatMm((g.widthM ?? 0) * 1000)} mm wide, thickness to suit`;
  if (g.tubeRatio)
    return `${SECTION_LABEL[g.section]}, outer size ${fmt(g.tubeRatio)} × the wall thickness`;
  return SECTION_LABEL[g.section];
}

// ---------------------------------------------------------------------------
// Screening
// ---------------------------------------------------------------------------
type RatingField = keyof Ratings;
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

/** DECISION: a custom environment is unknown territory, so it needs a "good" (B) rating, like wet/marine/chemical. */
export const CUSTOM_ENV_MIN: Rating = 'B';

const ratingOk = (r: Rating, min: Rating) =>
  RATINGS.indexOf(r) <= RATINGS.indexOf(min);

interface Needs {
  props: Set<keyof typeof PROPERTY_META>;
  /** Custom property keys the calculation needs. */
  extra: Set<string>;
  /** True when shear modulus is needed (may be estimated from E). */
  needsG: boolean;
}

function requiredProperties(spec: DesignSpec, d: ResolvedDesign): Needs {
  const props = new Set<keyof typeof PROPERTY_META>();
  const extra = new Set<string>();
  let needsG = false;
  const need = (p: string) => {
    if (p === 'G') needsG = true;
    else if (isStd(p)) props.add(p);
    else extra.add(p);
  };
  for (const idx of d.indices) Object.keys(idx.terms).forEach(need);
  for (const l of spec.propertyLimits) need(l.property);
  if (d.sizing) {
    props.add('density');
    const s = d.sizing;
    if (s.component === 'shaft') {
      if (s.checkStiffness) needsG = true;
      if (s.checkStrength) props.add('strength');
    } else {
      if (s.checkStiffness) props.add('E');
      if (s.checkStrength) props.add('strength');
    }
    if (d.costObjective || spec.budgetPerPart !== null) props.add('price');
  }
  // In index mode, the index only carries the criteria actually asked for (handled above).
  if (spec.maxPricePerKg !== null) props.add('price');
  if (spec.tempRangeC) {
    props.add('tMax');
    if (spec.tempRangeC[0] < 0) props.add('tMin');
  }
  return { props, extra, needsG };
}

interface ScreenOutcome {
  reasons: string[];
  missing: string[];
  flags: string[];
  /** Material with G imputed if needed. */
  material: Material;
  gEstimated: boolean;
}

function screen(m: Material, spec: DesignSpec, needs: Needs): ScreenOutcome {
  const reasons: string[] = [];
  const missing: string[] = [];
  const flags: string[] = [];
  let material = m;
  let gEstimated = false;

  if (spec.excludeFamilies.includes(m.family))
    reasons.push(`You excluded ${FAMILY_LABEL[m.family].toLowerCase()}`);

  // Environment
  for (const env of spec.environment) {
    const bad: string[] = [];
    for (const { field, min } of ENV_REQUIREMENTS[env]) {
      const r = m.ratings[field];
      if (r === null) missing.push(`${RATING_FIELD_LABEL[field]} rating`);
      else if (!ratingOk(r, min))
        bad.push(`${RATING_FIELD_LABEL[field]} rating ${r}`);
    }
    if (bad.length) {
      const min = ENV_REQUIREMENTS[env]
        .map((x) => x.min)
        .sort()
        .reverse()[0];
      const verb = m.family === 'metal' ? 'Corrodes' : 'Degrades';
      reasons.push(
        `${verb} ${ENV_LABEL[env]}: ${bad.join(', ')} (needs ${min} or better)`,
      );
    }
  }

  for (const env of spec.customEnvironments) {
    const r = m.customRatings[normEnv(env)];
    if (r === null || r === undefined) missing.push(`rating for “${env}”`);
    else if (!ratingOk(r, CUSTOM_ENV_MIN))
      reasons.push(
        `Not suited to “${env}”: rating ${r} (needs ${CUSTOM_ENV_MIN} or better)`,
      );
  }

  // Tools
  const badTools: string[] = [];
  for (const p of spec.requiredProcesses) {
    const r = m.processes[p];
    if (!r) missing.push(`rating for ${PROCESS_LABEL[p]}`);
    else if (r === 'difficult' || r === 'no')
      badTools.push(
        `${PROCESS_LABEL[p]} (${r === 'no' ? 'not possible' : 'difficult'})`,
      );
  }
  if (badTools.length)
    reasons.push(`Hard to work with your tools: ${badTools.join(', ')}`);

  // Must-haves
  if (spec.mustHave.includes('transparent') && !m.transparent)
    reasons.push('Not transparent');
  if (spec.mustHave.includes('electrical_insulator') && !m.electricalInsulator)
    reasons.push('Conducts electricity — you need an electrical insulator');
  if (spec.mustHave.includes('impact_resistant') && m.brittle)
    reasons.push('Brittle — can crack or shatter under impact');

  // Temperature window
  if (spec.tempRangeC) {
    const [tLo, tHi] = spec.tempRangeC;
    if (m.tMax && m.tMax[0] < tHi)
      reasons.push(
        `Maximum service temperature about ${fmt(m.tMax[0])}–${fmt(m.tMax[1])} °C; it must reliably handle ${fmt(tHi)} °C`,
      );
    if (tLo < 0 && m.tMin && m.tMin[1] > tLo)
      reasons.push(
        `Can become brittle or unusable below about ${fmt(m.tMin[1])} °C; you need ${fmt(tLo)} °C`,
      );
  }

  // Price per kg
  if (spec.maxPricePerKg !== null && m.price) {
    if (m.price[0] > spec.maxPricePerKg)
      reasons.push(
        `Costs at least ${fmtUsd(m.price[0])}/kg, above your ${fmtUsd(spec.maxPricePerKg)}/kg limit`,
      );
    else if (m.price[1] > spec.maxPricePerKg)
      flags.push(
        `Upper end of the price range (${fmtUsd(m.price[1])}/kg) is above your limit`,
      );
  }

  // Property limits. DECISION: a material is ruled out only when its whole range fails the limit;
  // a range that straddles the limit passes with a flag (the right grade may meet it).
  for (const l of spec.propertyLimits) {
    const r =
      l.property === 'G' && !m.G && m.E ? null : propRange(m, l.property);
    if (!r) continue; // reported as missing data below
    const meta = propMeta(spec, l.property);
    const value = withUnit(fmtRange(r), meta.unit);
    const why = l.reason ? ` (${l.reason})` : '';
    if (l.min !== null && r[1] < l.min)
      reasons.push(
        `${meta.label} about ${value}; needs at least ${withUnit(fmt(l.min), meta.unit)}${why}`,
      );
    else if (l.max !== null && r[0] > l.max)
      reasons.push(
        `${meta.label} about ${value}; needs at most ${withUnit(fmt(l.max), meta.unit)}${why}`,
      );
    else if (
      (l.min !== null && r[0] < l.min) ||
      (l.max !== null && r[1] > l.max)
    )
      flags.push(
        `Only part of its ${meta.label.toLowerCase()} range (${value}) meets the requirement — choose the grade carefully`,
      );
  }

  // Data needed for the calculation
  for (const p of needs.props)
    if (m[p] === null)
      missing.push(`${PROPERTY_META[p].label} (${PROPERTY_META[p].symbol})`);
  for (const k of needs.extra)
    if (!m.extra?.[k]) missing.push(propMeta(spec, k).label);
  if (needs.needsG && m.G === null) {
    if (m.E) {
      material = { ...m, G: [m.E[0] / G_FROM_E, m.E[1] / G_FROM_E] };
      gEstimated = true;
      flags.push(`Shear modulus estimated as E/${G_FROM_E} (not supplied)`);
    } else missing.push(`${PROPERTY_META.G.label} (G)`);
  }

  return {
    reasons,
    missing: Array.from(new Set(missing)),
    flags,
    material,
    gEstimated,
  };
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------
interface PropDraw {
  E: number;
  G: number;
  strength: number;
  density: number;
  price: number;
  lambda: number;
  alpha: number;
  /** Every property in its stored unit (GPa, MPa, kg/m³, USD/kg, °C, µstrain/K, …), incl. custom ones — for indices. */
  ix: Record<string, number>;
}

interface Candidate {
  m: Material;
  gEstimated: boolean;
  flags: string[];
  geometry: SectionGeometry | null;
  sectionNotes: string[];
  nominal: PropDraw;
  objective: number;
  sizing: Sizing | null;
  indexValues: Record<string, number>;
  samples: number[];
}

const lo = (r: Range | null) => (r ? r[0] : NaN);
const hi = (r: Range | null) => (r ? r[1] : NaN);
const mid = (r: Range | null) => (r ? geoMean(r[0], r[1]) : NaN);

/** Conservative nominal properties: low end of E/G/strength, central density and price, high end of λ and α. */
function nominalProps(m: Material): PropDraw {
  return {
    E: lo(m.E) * GPA,
    G: lo(m.G) * GPA,
    strength: lo(m.strength) * MPA,
    density: mid(m.density),
    price: mid(m.price),
    lambda: hi(m.lambda),
    alpha: hi(m.alpha) * 1e-6,
    ix: {},
  };
}

/**
 * Conservative nominal values for an index: for each term take the end of the range that makes the index
 * worse (low end when the exponent is positive, high end when negative); density and price use the central value.
 */
function nominalIndexProps(
  m: Material,
  terms: IndexTerms,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, e] of Object.entries(terms) as [string, number][]) {
    const r = propRange(m, k);
    out[k] = k === 'density' || k === 'price' ? mid(r) : e > 0 ? lo(r) : hi(r);
  }
  return out;
}

function drawProps(
  m: Material,
  rng: () => number,
  gEstimated: boolean,
): PropDraw {
  const s = (r: Range | null) => (r ? sampleRange(rng, r[0], r[1]) : NaN);
  // Draw every property in a fixed order so the stream is reproducible regardless of what is used.
  const E = s(m.E);
  const Gdraw = s(m.G);
  const d: PropDraw = {
    E: E * GPA,
    G: (gEstimated ? E / G_FROM_E : Gdraw) * GPA,
    strength: s(m.strength) * MPA,
    density: s(m.density),
    price: s(m.price),
    lambda: s(m.lambda),
    alpha: s(m.alpha) * 1e-6,
    ix: {},
  };
  d.ix = {
    E,
    G: d.G / GPA,
    strength: d.strength / MPA,
    density: d.density,
    price: d.price,
    lambda: d.lambda,
    alpha: d.alpha * 1e6,
    Kic: s(m.Kic),
    tMax: s(m.tMax),
    tMin: s(m.tMin),
  };
  for (const k of Object.keys(m.extra ?? {}).sort()) d.ix[k] = s(m.extra[k]);
  return d;
}

function evaluateSizing(
  d: ResolvedDesign,
  g: SectionGeometry,
  p: PropDraw,
): {
  massKg: number;
  size: number;
  governing: ConstraintKey;
  areaM2: number;
} | null {
  const r = sizePart(d.sizing!, g, { E: p.E, G: p.G, strength: p.strength });
  if (!r) return null;
  const A = area(g, r.size);
  return {
    size: r.size,
    governing: r.governing,
    areaM2: A,
    massKg: p.density * A * d.sizing!.lengthM,
  };
}

// ---------------------------------------------------------------------------
// runSelection
// ---------------------------------------------------------------------------
export function runSelection(
  spec: DesignSpec,
  materials: Material[],
  opts: EngineOptions,
): EngineResult {
  const design = resolveDesign(spec);
  const warnings = [...design.warnings];
  const lowerIsBetter = design.mode === 'sizing';

  // ---- Plausibility -------------------------------------------------------
  const v = validateMaterials(materials);
  if (v.duplicatesRemoved.length)
    warnings.push(
      `Removed ${v.duplicatesRemoved.length} duplicate candidate(s): ${v.duplicatesRemoved.join(', ')}.`,
    );

  // ---- Screening ------------------------------------------------------------
  const needs = requiredProperties(spec, design);
  const rejected: ExcludedMaterial[] = [];
  const notEvaluated: ExcludedMaterial[] = [];
  const candidates: Candidate[] = [];
  const ex = (m: Material, reasons: string[]): ExcludedMaterial => ({
    materialId: m.id,
    name: m.name,
    family: m.family,
    grade: m.grade,
    reasons,
  });

  for (const m0 of v.valid) {
    const s = screen(m0, spec, needs);
    if (s.reasons.length) {
      rejected.push(ex(m0, s.reasons));
      continue;
    }
    if (s.missing.length) {
      notEvaluated.push(ex(m0, [`Missing data: ${s.missing.join(', ')}`]));
      continue;
    }
    const m = s.material;
    const flags = [...(v.flags.get(m.id) ?? []), ...s.flags];
    let geometry = design.geometry;
    const sectionNotes: string[] = [];
    if (geometry && geometry.tubeRatio && NO_TUBE_FAMILIES.includes(m.family)) {
      const solid = solidEquivalent(geometry.section);
      geometry = sectionGeometry(solid, spec.tubeRatio, geometry.widthM);
      sectionNotes.push(
        `Sized as a ${SECTION_LABEL[solid]}: ${FAMILY_LABEL[m.family].toLowerCase()} are not normally sold as tube`,
      );
    }
    candidates.push({
      m,
      gEstimated: s.gEstimated,
      flags,
      geometry,
      sectionNotes,
      nominal: nominalProps(m),
      objective: NaN,
      sizing: null,
      indexValues: {},
      samples: [],
    });
  }

  // ---- Nominal evaluation ------------------------------------------------
  let fitting: Candidate[] = [];
  for (const c of candidates) {
    for (const idx of design.indices) {
      const props = nominalIndexProps(c.m, idx.terms);
      if (c.gEstimated && 'G' in idx.terms && c.m.E)
        props.G = (idx.terms.G! > 0 ? c.m.E[0] : c.m.E[1]) / G_FROM_E;
      c.indexValues[indexKey(idx, design)] = evaluateIndex(idx.terms, props);
    }
    if (design.mode === 'sizing') {
      const r = evaluateSizing(design, c.geometry!, c.nominal);
      if (!r || !Number.isFinite(r.massKg)) {
        notEvaluated.push(
          ex(c.m, ['Could not size the part from the available data']),
        );
        continue;
      }
      const L = design.sizing!.lengthM;
      const costUsd: Range | null = c.m.price
        ? [r.massKg * c.m.price[0], r.massKg * c.m.price[1]]
        : null;
      const notes = [...c.sectionNotes];
      const g = c.geometry!;
      if (g.section === 'rect_fixed_width' && g.widthM && r.size > g.widthM)
        notes.push(
          'The board would be thicker than it is wide — a deeper, narrower section would be more efficient',
        );
      c.sizing = {
        dimension: describeSection(g, r.size),
        sizeMm: r.size * 1000,
        sectionUsed: g.section,
        areaMm2: r.areaM2 * 1e6,
        massKg: r.massKg,
        costUsd,
        governing: GOVERNING_TEXT[r.governing],
        notes,
      };
      c.objective = design.costObjective
        ? r.massKg * c.nominal.price
        : r.massKg;

      // DECISION: slender-member formulas are meaningless if the section is as big as the span.
      if (
        (spec.component === 'beam' || spec.component === 'column') &&
        r.size > L / 2
      ) {
        rejected.push(
          ex(c.m, [
            `Would need a section about ${formatMm(r.size * 1000)} mm across for a ${formatMm(L * 1000)} mm long part — far too bulky to be practical`,
          ]),
        );
        continue;
      }
      if (spec.budgetPerPart !== null && costUsd) {
        if (costUsd[0] > spec.budgetPerPart) {
          rejected.push(
            ex(c.m, [
              `The part would cost at least ${fmtUsd(costUsd[0])} in material, above your ${fmtUsd(spec.budgetPerPart)} budget`,
            ]),
          );
          continue;
        }
        if (costUsd[1] > spec.budgetPerPart)
          c.flags.push(
            `At the top of its price range the part could exceed your budget (${fmtUsd(costUsd[1])})`,
          );
      }
    }
    if (
      design.mode === 'index' &&
      Object.values(c.indexValues).some((x) => !Number.isFinite(x))
    ) {
      notEvaluated.push(
        ex(c.m, [
          'Could not compute the performance index from the available data',
        ]),
      );
      continue;
    }
    fitting.push(c);
  }

  if (design.mode === 'index') {
    // Combined score: the weakest normalised index (each index ÷ the best fitting value), as a %.
    const best = indexBests(fitting.map((c) => c.indexValues));
    for (const c of fitting) c.objective = combinedScore(c.indexValues, best);
  }

  // ---- Ranking order (nominal) ------------------------------------------
  fitting.sort(
    (a, b) =>
      (lowerIsBetter ? a.objective - b.objective : b.objective - a.objective) ||
      a.m.name.localeCompare(b.m.name),
  );

  // ---- Monte Carlo -----------------------------------------------------------
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
  const N = Math.max(1, Math.floor(opts.mcSamples));
  const bestCount = new Array<number>(fitting.length).fill(0);
  const top3Count = new Array<number>(fitting.length).fill(0);

  if (fitting.length) {
    const g = fitting.map((c) => c.geometry);
    for (let s = 0; s < N; s++) {
      const draws = fitting.map((c) => drawProps(c.m, rng, c.gEstimated));
      let values: number[];
      if (design.mode === 'sizing') {
        values = draws.map((p, i) => {
          const r = evaluateSizing(design, g[i]!, p);
          if (!r) return NaN;
          return design.costObjective ? r.massKg * p.price : r.massKg;
        });
      } else {
        const iv = draws.map((p) => {
          const out: Record<string, number> = {};
          for (const idx of design.indices)
            out[indexKey(idx, design)] = evaluateIndex(idx.terms, p.ix);
          return out;
        });
        const best = indexBests(iv);
        values = iv.map((x) => combinedScore(x, best));
      }
      values.forEach((x, i) => fitting[i].samples.push(x));
      const order = values
        .map((x, i) => [x, i] as const)
        .filter(([x]) => Number.isFinite(x))
        .sort((a, b) => (lowerIsBetter ? a[0] - b[0] : b[0] - a[0]));
      if (order.length) bestCount[order[0][1]]++;
      for (const [, i] of order.slice(0, 3)) top3Count[i]++;
    }
  }

  // ---- Assemble ranking with code-generated reasons -----------------------
  const ranking: RankedMaterial[] = fitting.map((c, i) => {
    const sorted = c.samples.filter(Number.isFinite).sort((a, b) => a - b);
    const interval: Range = [percentile(sorted, 0.1), percentile(sorted, 0.9)];
    const processFit: Partial<Record<Process, ProcessRating>> = {};
    for (const p of spec.requiredProcesses)
      if (c.m.processes[p]) processFit[p] = c.m.processes[p];
    return {
      rank: i + 1,
      materialId: c.m.id,
      name: c.m.name,
      family: c.m.family,
      grade: c.m.grade,
      confidence: c.m.confidence,
      objectiveValue: c.objective,
      objectiveInterval: interval,
      pBest: bestCount[i] / N,
      pTop3: top3Count[i] / N,
      indexValues: c.indexValues,
      sizing: c.sizing,
      processFit,
      reasons: [],
      dataFlags: Array.from(new Set(c.flags)),
    };
  });
  addReasons(ranking, fitting, spec, design);

  // ---- Warnings & safety notes ------------------------------------------
  // DECISION: the §6.4 close-call rule, applied only when the race between the top two is real (one of them
  // wins at least 20% of simulations); otherwise two near-zero chances would trigger a meaningless warning.
  if (
    ranking.length >= 2 &&
    Math.abs(ranking[0].pBest - ranking[1].pBest) < CLOSE_CALL &&
    Math.max(ranking[0].pBest, ranking[1].pBest) >= 0.2
  ) {
    warnings.push(
      `${ranking[0].name} and ${ranking[1].name} are a close call (best in ${pct(ranking[0].pBest)} vs ${pct(ranking[1].pBest)} of simulations): either could be the better choice with real supplier data.`,
    );
  }
  const mcFavourite = ranking.reduce<RankedMaterial | null>(
    (a, r) => (!a || r.pBest > a.pBest ? r : a),
    null,
  );
  if (mcFavourite && mcFavourite.rank > 1 && mcFavourite.pBest >= 0.5) {
    warnings.push(
      `${mcFavourite.name} ranks #${mcFavourite.rank} on the conservative calculation (weak end of each property range) but comes out best in ${pct(mcFavourite.pBest)} of simulations across the full ranges. Compare supplier datasheets for it and ${ranking[0].name} before deciding.`,
    );
  }
  if (!ranking.length) {
    warnings.push(
      'No candidate met every requirement. Look at "Ruled out" to see what blocked each material, then relax the strictest requirement (tools, environment, budget or limits).',
    );
  }
  const safetyNotes: string[] = [];
  if (spec.safetyClass !== 'general') {
    safetyNotes.push(
      `This part ${spec.safetyClass === 'lifting' ? 'lifts loads' : 'carries people'}: the result is guidance, not a certified design. Check the relevant standard and have a qualified engineer review it before use.`,
    );
  }
  if (spec.environment.includes('food_contact')) {
    safetyNotes.push(
      'For food contact, buy a grade that is certified food-safe (e.g. FDA / EU 10/2011 compliant) and confirm it with the supplier.',
    );
  }

  const index: IndexInfo = {
    expression: design.indices.map((x) => x.expression).join(' and '),
    description: design.indices.map((x) => x.description).join('; '),
    cost: design.costObjective,
  };

  const objective =
    design.mode === 'sizing'
      ? design.costObjective
        ? { label: 'Lowest material cost of the part', unit: 'USD' }
        : { label: 'Lowest mass of the part', unit: 'kg' }
      : { label: 'Performance index, as % of the best candidate', unit: '%' };

  return {
    spec,
    mode: design.mode,
    objectiveLabel: objective.label,
    objectiveUnit: objective.unit,
    lowerIsBetter,
    index,
    safetyFactor: design.sf,
    activeConstraints: design.activeConstraints,
    ranking,
    rejected,
    notEvaluated,
    invalidData: v.invalid,
    materials,
    warnings,
    safetyNotes,
    mcSamples: N,
    seed,
  };
}

const indexKey = (idx: IndexDef, d: ResolvedDesign) =>
  d.indices.length > 1 ? `${idx.criterion}: ${idx.expression}` : idx.expression;

function indexBests(rows: Record<string, number>[]): Record<string, number> {
  const best: Record<string, number> = {};
  for (const r of rows)
    for (const [k, x] of Object.entries(r))
      if (Number.isFinite(x) && !(x <= (best[k] ?? -Infinity))) best[k] = x;
  return best;
}

function combinedScore(
  values: Record<string, number>,
  best: Record<string, number>,
): number {
  let s = Infinity;
  for (const [k, x] of Object.entries(values))
    s = Math.min(s, (x / best[k]) * 100);
  return s;
}

// ---------------------------------------------------------------------------
// Reasons (generated from numbers)
// ---------------------------------------------------------------------------
function addReasons(
  ranking: RankedMaterial[],
  fitting: Candidate[],
  spec: DesignSpec,
  d: ResolvedDesign,
) {
  const top = ranking[0];
  ranking.forEach((r, i) => {
    const c = fitting[i];
    const out: string[] = [];
    if (d.mode === 'sizing' && r.sizing) {
      if (i === 0)
        out.push(
          d.costObjective
            ? `Cheapest part that meets every requirement: about ${fmtUsd(r.objectiveValue)} of material`
            : `Lightest part that meets every requirement: about ${fmt(r.objectiveValue)} kg`,
        );
      else {
        const ratio = r.objectiveValue / top.objectiveValue;
        const what = d.costObjective ? 'material cost' : 'mass';
        const value = d.costObjective
          ? fmtUsd(r.objectiveValue)
          : `${fmt(r.objectiveValue)} kg`;
        out.push(
          ratio < 1.05
            ? `Practically the same ${what} as the top pick (${value})`
            : `About ${fmt(ratio, 2)}× the ${what} of the top pick (${value})`,
        );
      }
      out.push(`Needs a ${r.sizing.dimension}`);
      out.push(`Size is set by ${r.sizing.governing}`);
      if (!d.costObjective && r.sizing.costUsd)
        out.push(
          `Material cost about ${fmtUsd(r.sizing.costUsd[0])}–${fmtUsd(r.sizing.costUsd[1])}`,
        );
      if (d.costObjective)
        out.push(`Part mass about ${fmt(r.sizing.massKg)} kg`);
      out.push(...r.sizing.notes);
    } else {
      out.push(
        i === 0
          ? `Highest performance index (${d.indices.map((x) => x.expression).join(', ')}) among the materials that fit`
          : `${fmt(r.objectiveValue, 2)}% of the best candidate's performance index`,
      );
    }
    if (ranking.length > 1)
      out.push(
        `Best choice in ${pct(r.pBest)} of ${fmt(fitting[0].samples.length)} simulations, top 3 in ${pct(r.pTop3)}`,
      );

    const envFields = new Set<keyof Ratings>();
    for (const env of spec.environment)
      for (const req of ENV_REQUIREMENTS[env]) envFields.add(req.field);
    const durability = [
      ...Array.from(envFields).map(
        (f) => `${RATING_FIELD_LABEL[f]} ${c.m.ratings[f]}`,
      ),
      ...spec.customEnvironments.map(
        (e) => `“${e}” ${c.m.customRatings[normEnv(e)]}`,
      ),
    ];
    if (durability.length)
      out.push(`Durability ratings: ${durability.join(', ')}`);
    const keyProps = Array.from(
      new Set([
        ...spec.propertyLimits.map((l) => l.property),
        ...(spec.component === 'custom'
          ? Object.keys(d.indices[0]?.terms ?? {})
          : []),
      ]),
    )
      .filter((k) => k !== 'price')
      .slice(0, 4);
    for (const k of keyProps) {
      const pr = propRange(c.m, k);
      const meta = propMeta(spec, k);
      if (pr)
        out.push(`${meta.label}: about ${withUnit(fmtRange(pr), meta.unit)}`);
    }
    const tools = Object.entries(r.processFit) as [Process, ProcessRating][];
    if (tools.length)
      out.push(
        `Works with your tools: ${tools.map(([p, x]) => `${PROCESS_LABEL[p]} (${x})`).join(', ')}`,
      );
    if (spec.tempRangeC && c.m.tMax && !keyProps.includes('tMax'))
      out.push(`Rated to about ${fmt(c.m.tMax[0])}–${fmt(c.m.tMax[1])} °C`);
    if (
      c.m.price &&
      (d.costObjective || spec.maxPricePerKg !== null || d.mode === 'index')
    )
      out.push(
        `Price about ${fmtUsd(c.m.price[0])}–${fmtUsd(c.m.price[1])} per kg`,
      );
    r.reasons = out;
  });
}
