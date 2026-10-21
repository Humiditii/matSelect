/**
 * Domain model: zod schemas + inferred TypeScript types.
 * Single source of truth for request validation, Claude output validation and engine I/O.
 * `web/lib/types.ts` mirrors the exported types.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// 5.1 Enumerations
// ---------------------------------------------------------------------------
export const AUDIENCES = ['craftsman', 'everyday', 'engineer'] as const;
export const COMPONENTS = [
  'beam',
  'tie',
  'column',
  'shaft',
  'spring',
  'hinge',
  'insulation',
  'thermal_shock',
  'custom',
] as const;
export const OBJECTIVES = [
  'min_mass',
  'min_cost',
  'min_carbon',
  'balanced',
] as const;
export const CRITERIA = ['stiffness', 'strength'] as const;
export const SUPPORTS = [
  'simply_supported_center',
  'simply_supported_uniform',
  'cantilever_end',
] as const;
export const END_CONDITIONS = [
  'pinned_pinned',
  'fixed_free',
  'fixed_fixed',
  'fixed_pinned',
] as const;
export const SECTIONS = [
  'solid_square',
  'solid_round',
  'round_tube',
  'square_tube',
  'rect_fixed_width',
] as const;
export const ENVIRONMENTS = [
  'indoor',
  'outdoor',
  'wet',
  'marine',
  'chemical',
  'food_contact',
] as const;
export const PROCESSES = [
  'hand_cut',
  'power_cut',
  'drill',
  'machine',
  'weld',
  'glue',
  'fasten',
  'bend',
  'cast',
  'mould',
  'print_3d',
  'woodwork',
] as const;
export const MUST_HAVES = [
  'transparent',
  'electrical_insulator',
  'impact_resistant',
  'recyclable',
  'renewable',
] as const;
export const RECYCLABILITY = ['good', 'possible', 'difficult', 'no'] as const;
export const FAMILIES = [
  'metal',
  'polymer',
  'ceramic_glass',
  'composite',
  'wood_natural',
  'foam_elastomer',
] as const;
export const SAFETY_CLASSES = ['general', 'carries_people', 'lifting'] as const;
export const RATINGS = ['A', 'B', 'C', 'D', 'E'] as const;
export const PROCESS_RATINGS = ['good', 'possible', 'difficult', 'no'] as const;
export const CONFIDENCES = ['high', 'medium', 'low'] as const;

export const FORCE_UNITS = ['N', 'kN', 'kg', 'lb'] as const;
export const TORQUE_UNITS = ['N·m', 'lbf·ft'] as const;
export const LENGTH_UNITS = ['mm', 'cm', 'm', 'in', 'ft'] as const;

export const DEFAULT_SAFETY_FACTORS: Record<SafetyClass, number> = {
  general: 1.5,
  carries_people: 2.5,
  lifting: 3,
};

export const Audience = z.enum(AUDIENCES);
export const Component = z.enum(COMPONENTS);
export const Objective = z.enum(OBJECTIVES);
export const Criterion = z.enum(CRITERIA);
export const Support = z.enum(SUPPORTS);
export const EndCondition = z.enum(END_CONDITIONS);
export const Section = z.enum(SECTIONS);
export const Environment = z.enum(ENVIRONMENTS);
export const Process = z.enum(PROCESSES);
export const MustHave = z.enum(MUST_HAVES);
export const Family = z.enum(FAMILIES);
export const SafetyClass = z.enum(SAFETY_CLASSES);
export const Rating = z.enum(RATINGS);
export const ProcessRating = z.enum(PROCESS_RATINGS);
export const Confidence = z.enum(CONFIDENCES);

export type Audience = z.infer<typeof Audience>;
export type Component = z.infer<typeof Component>;
export type Objective = z.infer<typeof Objective>;
export type Criterion = z.infer<typeof Criterion>;
export type Support = z.infer<typeof Support>;
export type EndCondition = z.infer<typeof EndCondition>;
export type Section = z.infer<typeof Section>;
export type Environment = z.infer<typeof Environment>;
export type Process = z.infer<typeof Process>;
export type MustHave = z.infer<typeof MustHave>;
export type Family = z.infer<typeof Family>;
export type SafetyClass = z.infer<typeof SafetyClass>;
export type Rating = z.infer<typeof Rating>;
export type ProcessRating = z.infer<typeof ProcessRating>;
export type Confidence = z.infer<typeof Confidence>;

// ---------------------------------------------------------------------------
// 5.2 DesignSpec
// ---------------------------------------------------------------------------
const finite = z.number().finite();

/** A quantity in the user's own unit. Units are checked by the engine (unknown unit → 400). */
export const Quantity = z.object({
  value: finite.positive('must be greater than zero'),
  unit: z.string().trim().min(1).max(12),
});
export type Quantity = z.infer<typeof Quantity>;

/** Key used to match a custom environment to its per-material rating. */
export const normEnv = (s: string) =>
  s.trim().toLowerCase().replace(/\s+/g, ' ');

const uniq = <T extends z.ZodTypeAny>(item: T) =>
  z.array(item).transform((xs) => Array.from(new Set(xs)) as z.infer<T>[]);

/** An application-specific property the standard set doesn't cover (e.g. friction coefficient, hardness). */
export const CustomProperty = z.object({
  key: z
    .string()
    .regex(
      /^[a-z][a-z0-9_]{1,39}$/,
      'key must be snake_case, e.g. friction_coefficient',
    ),
  label: z.string().trim().min(1).max(60),
  symbol: z.string().trim().max(8).default(''),
  unit: z.string().trim().max(20).default(''),
  higherIsBetter: z.boolean().default(true),
});
export type CustomProperty = z.infer<typeof CustomProperty>;

/** A requirement on one material property, in that property's unit. */
export const PropertyLimit = z
  .object({
    property: z.string().min(1).max(40),
    min: finite.nullable().default(null),
    max: finite.nullable().default(null),
    reason: z.string().max(200).default(''),
  })
  .refine(
    (l) => l.min !== null || l.max !== null,
    'give a minimum or a maximum',
  )
  .refine(
    (l) => l.min === null || l.max === null || l.min <= l.max,
    'minimum must not exceed maximum',
  );
export type PropertyLimit = z.infer<typeof PropertyLimit>;

/** What to maximise for a general part: a product of property powers (an Ashby-style material index). */
export const CustomObjective = z.object({
  description: z.string().trim().min(1).max(200),
  terms: z
    .array(
      z.object({
        property: z.string().min(1).max(40),
        exponent: finite
          .min(-4)
          .max(4)
          .refine((x) => x !== 0, 'exponent must not be 0'),
      }),
    )
    .min(1)
    .max(5),
});
export type CustomObjective = z.infer<typeof CustomObjective>;

const DesignSpecBase = z.object({
  title: z.string().trim().min(1).max(120),
  audience: Audience.default('everyday'),
  component: Component,
  objective: Objective.default('min_mass'),
  criteria: uniq(Criterion)
    .default(['stiffness', 'strength'])
    .refine((c) => c.length > 0, 'choose at least one criterion'),
  load: Quantity.nullable().default(null),
  length: Quantity.nullable().default(null),
  maxDeflection: Quantity.nullable().default(null),
  maxTwistDeg: finite.positive().max(360).nullable().default(null),
  support: Support.default('simply_supported_center'),
  endCondition: EndCondition.default('pinned_pinned'),
  section: Section.default('solid_square'),
  sectionWidth: Quantity.nullable().default(null),
  tubeRatio: finite
    .min(2.5, 'outer size ÷ wall must be at least 2.5')
    .max(200)
    .default(15),
  environment: uniq(Environment).default(['indoor']),
  /** Conditions not in the list above, in the user's words (e.g. "near a chlorinated pool"). */
  customEnvironments: z
    .array(
      z
        .string()
        .trim()
        .min(2, 'describe the environment in a few words')
        .max(80),
    )
    .max(5, 'at most 5 custom environments')
    .transform((xs) =>
      Array.from(new Map(xs.map((x) => [normEnv(x), x])).values()),
    )
    .default([]),
  tempRangeC: z
    .tuple([finite.min(-273), finite.max(3000)])
    .refine(([a, b]) => a <= b, 'minimum temperature must not exceed maximum')
    .nullable()
    .default(null),
  requiredProcesses: uniq(Process).default([]),
  mustHave: uniq(MustHave).default([]),
  excludeFamilies: uniq(Family)
    .default([])
    .refine(
      (f) => f.length < FAMILIES.length,
      'at least one material family must remain',
    ),
  maxPricePerKg: finite.positive().nullable().default(null),
  budgetPerPart: finite.positive().nullable().default(null),
  safetyClass: SafetyClass.default('general'),
  safetyFactor: finite
    .min(1, 'safety factor must be at least 1')
    .max(20)
    .nullable()
    .default(null),
  assumptions: z.array(z.string().max(400)).max(40).default([]),
  sourceText: z.string().max(2000).default(''),
  /** Country for sourcing suggestions (ISO 3166-1 alpha-2, e.g. "NG"). */
  country: z
    .string()
    .regex(/^[A-Z]{2}$/, 'use a two-letter country code, e.g. NG')
    .nullable()
    .default(null),
  /** What the part does, in one plain sentence. */
  function: z.string().max(300).default(''),
  customProperties: z.array(CustomProperty).max(4).default([]),
  propertyLimits: z.array(PropertyLimit).max(8).default([]),
  customObjective: CustomObjective.nullable().default(null),
  /**
   * Exchange constants for the "balanced" goal (Ashby's penalty function Z = C + α_m·m + α_CO₂·CO₂):
   * what saving 1 kg of the part, and avoiding 1 kg of CO₂e, are worth in USD.
   */
  penalty: z
    .object({
      alphaMass: finite.min(0).max(1_000_000),
      alphaCo2: finite.min(0).max(10_000),
      rationale: z.string().max(240).default(''),
    })
    .nullable()
    .default(null),
});

export const DesignSpec = DesignSpecBase.superRefine((s, ctx) => {
  const known = new Set<string>([
    ...PROPERTY_KEYS,
    ...s.customProperties.map((p) => p.key),
  ]);
  s.propertyLimits.forEach((l, i) => {
    if (!known.has(l.property))
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['propertyLimits', i, 'property'],
        message: `unknown property "${l.property}"`,
      });
  });
  s.customObjective?.terms.forEach((t, i) => {
    if (!known.has(t.property))
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['customObjective', 'terms', i, 'property'],
        message: `unknown property "${t.property}"`,
      });
  });
});
export type DesignSpec = z.infer<typeof DesignSpec>;
export type DesignSpecInput = z.input<typeof DesignSpec>;

// ---------------------------------------------------------------------------
// 5.3 Material
// ---------------------------------------------------------------------------
/** [min, max] range; a null property means "unknown". */
export const Range = z.tuple([finite, finite]);
export type Range = [number, number];

export const PROPERTY_KEYS = [
  'density',
  'E',
  'G',
  'strength',
  'Kic',
  'tMax',
  'tMin',
  'lambda',
  'alpha',
  'price',
  'co2',
  'embodiedEnergy',
] as const;
export type PropertyKey = (typeof PROPERTY_KEYS)[number];

export const PROPERTY_META: Record<
  PropertyKey,
  { label: string; unit: string; symbol: string }
> = {
  density: { label: 'Density', unit: 'kg/m³', symbol: 'ρ' },
  E: { label: "Young's modulus", unit: 'GPa', symbol: 'E' },
  G: { label: 'Shear modulus', unit: 'GPa', symbol: 'G' },
  strength: { label: 'Strength', unit: 'MPa', symbol: 'σ' },
  Kic: { label: 'Fracture toughness', unit: 'MPa·√m', symbol: 'K_IC' },
  tMax: { label: 'Max service temperature', unit: '°C', symbol: 'T_max' },
  tMin: { label: 'Min service temperature', unit: '°C', symbol: 'T_min' },
  lambda: { label: 'Thermal conductivity', unit: 'W/m·K', symbol: 'λ' },
  alpha: { label: 'Thermal expansion', unit: 'µstrain/K', symbol: 'α' },
  price: { label: 'Price', unit: 'USD/kg', symbol: 'C' },
  co2: { label: 'Carbon footprint', unit: 'kg CO₂e/kg', symbol: 'CO₂' },
  embodiedEnergy: { label: 'Embodied energy', unit: 'MJ/kg', symbol: 'H' },
};

export const RatingsSchema = z.object({
  fresh_water: Rating.nullable(),
  salt_water: Rating.nullable(),
  uv: Rating.nullable(),
  chemicals: Rating.nullable(),
});
export type Ratings = z.infer<typeof RatingsSchema>;

export const Material = z.object({
  id: z.string(),
  name: z.string().min(1).max(120),
  family: Family,
  grade: z.string().max(80).nullable().default(null),
  density: Range.nullable(),
  E: Range.nullable(),
  G: Range.nullable(),
  strength: Range.nullable(),
  Kic: Range.nullable(),
  tMax: Range.nullable(),
  tMin: Range.nullable(),
  lambda: Range.nullable(),
  alpha: Range.nullable(),
  price: Range.nullable(),
  /** Cradle-to-gate footprint of the raw material, per kg (typical, virgin production). */
  co2: Range.nullable().default(null),
  embodiedEnergy: Range.nullable().default(null),
  brittle: z.boolean(),
  transparent: z.boolean(),
  electricalInsulator: z.boolean(),
  ratings: RatingsSchema,
  /** Suitability per custom environment, keyed by normEnv(text). Missing → unknown. */
  customRatings: z.record(z.string(), Rating.nullable()).default({}),
  processes: z.record(Process, ProcessRating).default({}),
  forms: z.array(z.string().max(80)).default([]),
  /** Values of the design's custom properties, keyed by CustomProperty.key. */
  extra: z.record(z.string(), Range.nullable()).default({}),
  /** References the values typically come from (AI-recalled — to verify). */
  sources: z.array(z.string().max(240)).max(6).default([]),
  // Sustainability and processing (null / empty = unknown).
  recyclability: z.enum(RECYCLABILITY).nullable().default(null),
  renewable: z.boolean().nullable().default(null),
  biodegradable: z.boolean().nullable().default(null),
  /** Elements/raw materials it contains, as named by the supplier of the data; matched to the EU list in code. */
  criticalElements: z.array(z.string().max(40)).max(12).default([]),
  hazards: z.array(z.string().max(160)).max(4).default([]),
  processingTips: z.array(z.string().max(220)).max(5).default([]),
  confidence: Confidence,
  notes: z.string().max(600).default(''),
});
export type Material = z.infer<typeof Material>;

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------
export const QuestionOption = z.object({
  label: z.string().min(1).max(120),
  value: z.unknown(),
});
export const Question = z.object({
  field: z.string().min(1).max(40),
  question: z.string().min(1).max(300),
  options: z.array(QuestionOption).min(1).max(6),
  default: z.unknown().optional(),
});
export type Question = z.infer<typeof Question>;

export const ExtractRequest = z.object({
  text: z
    .string()
    .trim()
    .min(5, 'please describe your part in at least 5 characters')
    .max(2000),
  audience: Audience.default('everyday'),
});
export type ExtractRequest = z.infer<typeof ExtractRequest>;

export interface ExtractResponse {
  spec: DesignSpec;
  questions: Question[];
  dataSource: DataSource;
}

// ---------------------------------------------------------------------------
// 5.4 SelectionResult
// ---------------------------------------------------------------------------
export type DataSource = 'llm' | 'mock';
export type Mode = 'sizing' | 'index';

export const CreateSelectionRequest = z.object({ spec: DesignSpec });
export const ExplainRequest = z.object({ audience: Audience });

export interface IndexInfo {
  expression: string;
  description: string;
  cost: boolean;
}

export interface Sizing {
  /** Human-readable size, e.g. "Ø 25.3 mm round tube, 1.7 mm wall". */
  dimension: string;
  /** Characteristic size in mm (side, diameter or thickness). */
  sizeMm: number;
  sectionUsed: Section;
  areaMm2: number;
  massKg: number;
  costUsd: Range | null;
  governing: string;
  notes: string[];
}

export interface RankedMaterial {
  rank: number;
  materialId: string;
  name: string;
  family: Family;
  grade: string | null;
  confidence: Confidence;
  objectiveValue: number;
  objectiveInterval: Range;
  pBest: number;
  pTop3: number;
  /** Per-criterion raw index values (index mode) for transparency. */
  indexValues: Record<string, number>;
  sizing: Sizing | null;
  processFit: Partial<Record<Process, ProcessRating>>;
  /** Carbon and energy for the sized part (basis "part") or per kg of material (basis "kg"). */
  footprint: FootprintI | null;
  sustainability: SustainabilityI;
  processability: ProcessabilityI;
  /** Coordinates for the trade-off chart: the part (sized) or per unit of performance relative to the lightest (index). */
  tradeoff: TradeoffI | null;
  /** Penalty breakdown for the "balanced" goal (sized parts). */
  penalty: PenaltyI | null;
  reasons: string[];
  dataFlags: string[];
}

export interface FootprintI {
  basis: 'part' | 'kg';
  co2Kg: Range | null;
  energyMJ: Range | null;
}

export interface SustainabilityI {
  recyclability: (typeof RECYCLABILITY)[number] | null;
  renewable: boolean | null;
  biodegradable: boolean | null;
  /** Matches against the EU critical raw materials list (Regulation (EU) 2024/1252, Annex II). */
  criticalRawMaterials: string[];
  hazards: string[];
}

export interface TradeoffI {
  /** "part": real values for the sized part; "relative": per unit of performance, lightest = 1. */
  basis: 'part' | 'relative';
  mass: number;
  cost: number | null;
  co2: number | null;
}

export interface PenaltyI {
  /** Z = material cost + α_m·mass + α_CO₂·CO₂ (USD-equivalent). */
  z: number;
  material: number;
  mass: number;
  carbon: number;
  alphaMass: number;
  alphaCo2: number;
}

export interface ProcessabilityI {
  level: 'easy' | 'moderate' | 'hard' | null;
  /** Processes rated "good" for this material, best first. */
  best: Process[];
  tips: string[];
}

export interface SupplierI {
  name: string;
  url: string;
  note: string;
}

export interface SourcingItemI {
  materialId: string;
  name: string;
  availability:
    'widely available' | 'specialist suppliers' | 'likely imported' | null;
  forms: string[];
  suppliers: SupplierI[];
  searchLinks: { label: string; url: string }[];
  notes: string;
}

export interface SourcingResultI {
  country: string;
  countryName: string;
  city: string | null;
  generatedAt: string;
  dataSource: DataSource;
  items: SourcingItemI[];
  note: string;
}

export interface ExcludedMaterial {
  materialId: string;
  name: string;
  family: Family;
  grade: string | null;
  reasons: string[];
}

export interface Explanation {
  audience: Audience;
  text: string;
  grounded: boolean;
  unverifiedNumbers: string[];
  generatedAt: string;
  dataSource: DataSource;
}

export interface SelectionResult {
  id: string;
  createdAt: string;
  spec: DesignSpec;
  mode: Mode;
  objectiveLabel: string;
  objectiveUnit: string;
  lowerIsBetter: boolean;
  index: IndexInfo;
  safetyFactor: number;
  activeConstraints: string[];
  ranking: RankedMaterial[];
  rejected: ExcludedMaterial[];
  notEvaluated: ExcludedMaterial[];
  invalidData: ExcludedMaterial[];
  materials: Material[];
  warnings: string[];
  safetyNotes: string[];
  dataSource: DataSource;
  /** Whose Claude key produced the AI data: the server's, the user's own, or none (demo data). */
  keySource?: 'server' | 'user' | 'none';
  explanations: Partial<Record<Audience, Explanation>>;
  /** Where-to-buy results, cached per country code. */
  sourcing?: Partial<Record<string, SourcingResultI>>;
  timingsMs: Record<string, number>;
  mcSamples: number;
  seed: number;
}

export interface SelectionSummary {
  id: string;
  createdAt: string;
  title: string;
  topPick: string | null;
  candidates: number;
}
