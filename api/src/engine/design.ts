import {
  DEFAULT_SAFETY_FACTORS,
  DesignSpec,
  Mode,
  Objective,
  Section,
} from 'src/common/domain/domain.types';
import {
  ENV_LABEL,
  FAMILY_LABEL,
  MUST_HAVE_LABEL,
  PROCESS_LABEL,
  RATING_FIELD_LABEL,
  SECTION_LABEL,
  formatNumber,
  formatUsd,
} from './labels';
import { IndexDef, IndexTerms, MASSLESS_INDEX, deriveIndices } from './indices';
import { SectionGeometry, formatMm, sectionGeometry } from './section';
import { SizingCase } from './sizing';
import { describeLimit } from './properties';
import { CUSTOM_ENV_MIN, ENV_REQUIREMENTS } from './screening';
import {
  SUPPORTED_UNITS,
  UnitError,
  isTorqueUnit,
  toMetres,
  toNewtonMetres,
  toNewtons,
} from './units';

/** USD-equivalent value of one kg of mass and one kg of CO₂e, for the balanced goal. */
export interface ExchangeConstants {
  mass: number;
  co2: number;
}

/** The brief turned into what the engine calculates with. */
export interface ResolvedDesign {
  safetyFactor: number;
  mode: Mode;
  sizing: SizingCase | null;
  geometry: SectionGeometry | null;
  indices: IndexDef[];
  warnings: string[];
  /** The requirements in plain words, shown to the user. */
  activeConstraints: string[];
  /** The goal actually used, which can differ from the one asked for. */
  goal: Objective;
  /** Set only for the balanced goal. */
  exchangeConstants: ExchangeConstants | null;
  /** Mass-based indices, used to place materials on the trade-off chart in index mode. */
  massIndices: IndexDef[];
}

// Plank width used when the user chose "board" but gave no width (a typical shelf board).
export const DEFAULT_BOARD_WIDTH_MM = 200;

// Used when the user picks "balanced" without values: $1 per kg saved, carbon at $100/t.
export const DEFAULT_ALPHA: ExchangeConstants = { mass: 1, co2: 0.1 };

const GOAL_NAME: Record<Objective, string> = {
  min_mass: 'lightest',
  min_cost: 'cheapest',
  min_carbon: 'lowest carbon',
  balanced: 'balanced',
};

const SIZING_COMPONENTS = ['beam', 'tie', 'column', 'shaft'] as const;
type SizingComponent = (typeof SIZING_COMPONENTS)[number];
const isSizingComponent = (component: string): component is SizingComponent =>
  (SIZING_COMPONENTS as readonly string[]).includes(component);

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

const STIFFNESS_LIMIT_NAME: Record<SizingComponent, string> = {
  shaft: 'maximum twist',
  tie: 'maximum stretch',
  beam: 'maximum bending (deflection)',
  column: 'maximum bending (deflection)',
};

const formatQuantity = (quantity: { value: number; unit: string }) =>
  `${formatNumber(quantity.value)} ${quantity.unit}`;

export function resolveDesign(spec: DesignSpec): ResolvedDesign {
  const warnings: string[] = [];
  const constraints: string[] = [];

  const defaultSafetyFactor = DEFAULT_SAFETY_FACTORS[spec.safetyClass];
  const safetyFactor = spec.safetyFactor ?? defaultSafetyFactor;
  if (spec.safetyFactor !== null && spec.safetyFactor < defaultSafetyFactor) {
    warnings.push(
      `Your safety factor ${formatNumber(safetyFactor)} is lower than the usual ${formatNumber(defaultSafetyFactor)} for this use (${spec.safetyClass.replace('_', ' ')}). Parts will be thinner and closer to failure.`,
    );
  }

  const { goal, exchangeConstants } = resolveGoal(spec, warnings);
  const { section, widthM } = resolveSection(spec, warnings);

  const custom =
    spec.component === 'custom'
      ? {
          terms: Object.fromEntries(
            (spec.customObjective?.terms ?? []).map((term) => [
              term.property,
              term.exponent,
            ]),
          ) as IndexTerms,
          description: spec.customObjective?.description ?? '',
          symbols: Object.fromEntries(
            spec.customProperties.map((p) => [p.key, p.symbol || p.label]),
          ),
        }
      : null;
  const massIndices = deriveIndices(
    spec.component,
    spec.criteria,
    section,
    'min_mass',
    custom,
  );
  // The balanced goal ranks the mass-based index divided by the penalty per kg.
  const indices =
    goal === 'balanced'
      ? massIndices.map((index) => ({
          ...index,
          expression: `${index.expression}·(C + α_m + α_CO₂·CO₂)`,
          description: `${index.description}, per unit of penalty (cost + value of mass + value of carbon)`,
        }))
      : deriveIndices(spec.component, spec.criteria, section, goal, custom);

  let sizing: SizingCase | null = null;
  let geometry: SectionGeometry | null = null;
  if (isSizingComponent(spec.component)) {
    sizing = buildSizingCase(spec, spec.component, safetyFactor, warnings);
    if (sizing) {
      geometry = sectionGeometry(section, spec.tubeRatio, widthM);
      constraints.push(...describeSizing(spec, sizing));
      constraints.push(`Section: ${describeSectionChoice(geometry)}`);
    } else {
      warnings.push(indexOnlyWarning(spec));
    }
  }

  if (exchangeConstants)
    constraints.push(
      `Penalty Z = material cost + $${formatNumber(exchangeConstants.mass)} per kg of mass + $${formatNumber(exchangeConstants.co2)} per kg CO₂e${spec.penalty?.rationale ? ` (${spec.penalty.rationale})` : ''}`,
    );
  constraints.push(...describeScreening(spec));
  if (spec.budgetPerPart !== null) {
    if (sizing)
      constraints.push(
        `Material cost of the part at most ${formatUsd(spec.budgetPerPart)}`,
      );
    else
      warnings.push(
        'The budget per part could not be checked because the part was not sized.',
      );
  }

  return {
    safetyFactor,
    mode: sizing ? 'sizing' : 'index',
    sizing,
    geometry,
    indices,
    warnings,
    activeConstraints: constraints,
    goal,
    exchangeConstants,
    massIndices,
  };
}

function resolveGoal(
  spec: DesignSpec,
  warnings: string[],
): { goal: Objective; exchangeConstants: ExchangeConstants | null } {
  let goal = spec.objective;
  if (goal !== 'min_mass' && MASSLESS_INDEX.includes(spec.component)) {
    warnings.push(
      `The goal "${GOAL_NAME[goal]}" does not change this ranking: the index for this part does not depend on how much material is used.`,
    );
    goal = 'min_mass';
  }
  if (goal !== 'balanced') return { goal, exchangeConstants: null };

  if (spec.penalty)
    return {
      goal,
      exchangeConstants: {
        mass: spec.penalty.alphaMass,
        co2: spec.penalty.alphaCo2,
      },
    };
  warnings.push(
    `No exchange constants were given for the balanced goal, so $${DEFAULT_ALPHA.mass} per kg saved and $${DEFAULT_ALPHA.co2} per kg CO₂e (a carbon price of $${DEFAULT_ALPHA.co2 * 1000}/t) were assumed.`,
  );
  return { goal, exchangeConstants: DEFAULT_ALPHA };
}

function resolveSection(
  spec: DesignSpec,
  warnings: string[],
): { section: Section; widthM: number | null } {
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
    if (spec.sectionWidth) {
      widthM = toMetres(spec.sectionWidth, 'sectionWidth');
    } else {
      widthM = DEFAULT_BOARD_WIDTH_MM / 1000;
      warnings.push(
        `No board width was given, so ${DEFAULT_BOARD_WIDTH_MM} mm was assumed.`,
      );
    }
  }
  return { section, widthM };
}

/** The sizing case in SI units, or null when the part cannot be sized. */
function buildSizingCase(
  spec: DesignSpec,
  component: SizingComponent,
  safetyFactor: number,
  warnings: string[],
): SizingCase | null {
  if (!spec.load || !spec.length) return null;

  const isTorque = isTorqueUnit(spec.load.unit);
  if (component === 'shaft' && !isTorque)
    throw new UnitError(
      'load (shaft torque)',
      spec.load.unit,
      SUPPORTED_UNITS.torque,
    );
  if (component !== 'shaft' && isTorque)
    throw new UnitError('load', spec.load.unit, SUPPORTED_UNITS.force);

  const load =
    component === 'shaft' ? toNewtonMetres(spec.load) : toNewtons(spec.load);
  const lengthM = toMetres(spec.length, 'length');
  const maxDeflectionM = spec.maxDeflection
    ? toMetres(spec.maxDeflection, 'maxDeflection')
    : null;
  const maxTwistRad =
    spec.maxTwistDeg !== null ? (spec.maxTwistDeg * Math.PI) / 180 : null;

  let checkStiffness: boolean;
  let checkStrength: boolean;
  if (component === 'column') {
    // Buckling and crushing are both ways a column fails, so both are always checked.
    checkStiffness = true;
    checkStrength = true;
  } else {
    const wantsStiffness = spec.criteria.includes('stiffness');
    const stiffnessLimit = component === 'shaft' ? maxTwistRad : maxDeflectionM;
    checkStiffness = wantsStiffness && stiffnessLimit !== null;
    checkStrength = spec.criteria.includes('strength');
    if (wantsStiffness && stiffnessLimit === null) {
      const limitName = STIFFNESS_LIMIT_NAME[component];
      warnings.push(
        checkStrength
          ? `Stiffness was not checked because no ${limitName} was given — only strength sets the size.`
          : `No ${limitName} was given, so parts could not be sized for stiffness.`,
      );
    }
  }
  if (!checkStiffness && !checkStrength) return null;

  return {
    component,
    load,
    lengthM,
    safetyFactor,
    maxDeflectionM,
    maxTwistRad,
    support: spec.support,
    endCondition: spec.endCondition,
    checkStiffness,
    checkStrength,
  };
}

function describeSizing(spec: DesignSpec, sizing: SizingCase): string[] {
  const load = formatQuantity(spec.load!);
  const length = formatQuantity(spec.length!);
  const safetyFactor = formatNumber(sizing.safetyFactor);
  const lines: string[] = [];
  switch (sizing.component) {
    case 'beam':
      lines.push(
        `Beam ${length} long, ${SUPPORT_TEXT[spec.support]}, carrying ${load}`,
      );
      if (sizing.checkStiffness)
        lines.push(
          `Bends no more than ${formatQuantity(spec.maxDeflection!)} under the load`,
        );
      if (sizing.checkStrength)
        lines.push(
          `Bending stress stays below strength ÷ ${safetyFactor} (safety factor)`,
        );
      break;
    case 'tie':
      lines.push(`Tie ${length} long, pulled with ${load}`);
      if (sizing.checkStiffness)
        lines.push(
          `Stretches no more than ${formatQuantity(spec.maxDeflection!)}`,
        );
      if (sizing.checkStrength)
        lines.push(
          `Tensile stress stays below strength ÷ ${safetyFactor} (safety factor)`,
        );
      break;
    case 'column':
      lines.push(
        `Column ${length} long (${END_TEXT[spec.endCondition]}), carrying ${load}`,
        `Does not buckle at ${safetyFactor} × the load (Euler buckling)`,
        `Does not crush: stress below strength ÷ ${safetyFactor}`,
      );
      break;
    case 'shaft':
      lines.push(`Shaft ${length} long, transmitting ${load} of torque`);
      if (sizing.checkStiffness)
        lines.push(`Twists no more than ${formatNumber(spec.maxTwistDeg!)}°`);
      if (sizing.checkStrength)
        lines.push(
          `Shear stress stays below strength ÷ (√3 × ${safetyFactor})`,
        );
      break;
  }
  return lines;
}

function indexOnlyWarning(spec: DesignSpec): string {
  const missing: string[] = [];
  if (!spec.load) missing.push('the load');
  if (!spec.length)
    missing.push(spec.component === 'beam' ? 'the span' : 'the length');
  if (!missing.length)
    return 'Ranked by performance index only because no limit could be checked. Add a deflection/twist limit or the strength criterion to size the part.';
  return `Ranked by performance index only because ${missing.join(' and ')} ${missing.length > 1 ? 'were' : 'was'} not given. Add them to get part sizes, masses and costs.`;
}

function describeSectionChoice(geometry: SectionGeometry): string {
  if (geometry.section === 'rect_fixed_width')
    return `board ${formatMm((geometry.widthM ?? 0) * 1000)} mm wide, thickness to suit`;
  if (geometry.tubeRatio)
    return `${SECTION_LABEL[geometry.section]}, outer size ${formatNumber(geometry.tubeRatio)} × the wall thickness`;
  return SECTION_LABEL[geometry.section];
}

/** The screening requirements in plain words (everything except the budget per part). */
function describeScreening(spec: DesignSpec): string[] {
  const lines: string[] = [];
  for (const limit of spec.propertyLimits)
    lines.push(describeLimit(spec, limit));
  if (spec.tempRangeC)
    lines.push(
      `Works from ${formatNumber(spec.tempRangeC[0])} °C to ${formatNumber(spec.tempRangeC[1])} °C`,
    );
  for (const env of spec.environment) {
    const requirements = ENV_REQUIREMENTS[env];
    if (requirements.length)
      lines.push(
        `Durable ${ENV_LABEL[env]}: ${requirements.map((r) => `${RATING_FIELD_LABEL[r.field]} rating ${r.min} or better`).join(', ')}`,
      );
  }
  for (const env of spec.customEnvironments)
    lines.push(`Suited to “${env}”: rating ${CUSTOM_ENV_MIN} or better`);
  if (spec.requiredProcesses.length)
    lines.push(
      `Workable with your tools: ${spec.requiredProcesses.map((p) => PROCESS_LABEL[p]).join(', ')} (rated good or possible)`,
    );
  for (const mustHave of spec.mustHave)
    lines.push(`Must be ${MUST_HAVE_LABEL[mustHave]}`);
  if (spec.excludeFamilies.length)
    lines.push(
      `Excluded: ${spec.excludeFamilies.map((f) => FAMILY_LABEL[f]).join(', ')}`,
    );
  if (spec.maxPricePerKg !== null)
    lines.push(`Material price at most ${formatUsd(spec.maxPricePerKg)}/kg`);
  return lines;
}
