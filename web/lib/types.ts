/** Mirror of the backend domain types (api/src/domain/types.ts). Keep in sync. */

export const AUDIENCES = ['craftsman', 'everyday', 'engineer'] as const;
export const COMPONENTS = ['beam', 'tie', 'column', 'shaft', 'spring', 'hinge', 'insulation', 'thermal_shock', 'custom'] as const;
export const OBJECTIVES = ['min_mass', 'min_cost'] as const;
export const CRITERIA = ['stiffness', 'strength'] as const;
export const SUPPORTS = ['simply_supported_center', 'simply_supported_uniform', 'cantilever_end'] as const;
export const END_CONDITIONS = ['pinned_pinned', 'fixed_free', 'fixed_fixed', 'fixed_pinned'] as const;
export const SECTIONS = ['solid_square', 'solid_round', 'round_tube', 'square_tube', 'rect_fixed_width'] as const;
export const ENVIRONMENTS = ['indoor', 'outdoor', 'wet', 'marine', 'chemical', 'food_contact'] as const;
export const PROCESSES = ['hand_cut', 'power_cut', 'drill', 'machine', 'weld', 'glue', 'fasten', 'bend', 'cast', 'mould', 'print_3d', 'woodwork'] as const;
export const MUST_HAVES = ['transparent', 'electrical_insulator', 'impact_resistant'] as const;
export const FAMILIES = ['metal', 'polymer', 'ceramic_glass', 'composite', 'wood_natural', 'foam_elastomer'] as const;
export const SAFETY_CLASSES = ['general', 'carries_people', 'lifting'] as const;

export type Audience = (typeof AUDIENCES)[number];
export type Component = (typeof COMPONENTS)[number];
export type Objective = (typeof OBJECTIVES)[number];
export type Criterion = (typeof CRITERIA)[number];
export type Support = (typeof SUPPORTS)[number];
export type EndCondition = (typeof END_CONDITIONS)[number];
export type Section = (typeof SECTIONS)[number];
export type Environment = (typeof ENVIRONMENTS)[number];
export type Process = (typeof PROCESSES)[number];
export type MustHave = (typeof MUST_HAVES)[number];
export type Family = (typeof FAMILIES)[number];
export type SafetyClass = (typeof SAFETY_CLASSES)[number];
export type Rating = 'A' | 'B' | 'C' | 'D' | 'E';
export type ProcessRating = 'good' | 'possible' | 'difficult' | 'no';
export type Confidence = 'high' | 'medium' | 'low';
export type Range = [number, number];
export type DataSource = 'llm' | 'mock';

export const DEFAULT_SAFETY_FACTORS: Record<SafetyClass, number> = { general: 1.5, carries_people: 2.5, lifting: 3 };
export const FORCE_UNITS = ['N', 'kN', 'kg', 'lb'];
export const TORQUE_UNITS = ['N·m', 'lbf·ft'];
export const LENGTH_UNITS = ['mm', 'cm', 'm', 'in', 'ft'];

export interface Quantity {
  value: number;
  unit: string;
}

export const STANDARD_PROPERTIES = ['density', 'E', 'G', 'strength', 'Kic', 'tMax', 'tMin', 'lambda', 'alpha', 'price'] as const;
export type StandardProperty = (typeof STANDARD_PROPERTIES)[number];

export interface CustomProperty {
  key: string;
  label: string;
  symbol: string;
  unit: string;
  higherIsBetter: boolean;
}

export interface PropertyLimit {
  property: string;
  min: number | null;
  max: number | null;
  reason: string;
}

export interface CustomObjective {
  description: string;
  terms: { property: string; exponent: number }[];
}

export interface DesignSpec {
  title: string;
  audience: Audience;
  component: Component;
  objective: Objective;
  criteria: Criterion[];
  load: Quantity | null;
  length: Quantity | null;
  maxDeflection: Quantity | null;
  maxTwistDeg: number | null;
  support: Support;
  endCondition: EndCondition;
  section: Section;
  sectionWidth: Quantity | null;
  tubeRatio: number;
  environment: Environment[];
  /** Conditions not in the list, in the user's own words. */
  customEnvironments: string[];
  tempRangeC: [number, number] | null;
  requiredProcesses: Process[];
  mustHave: MustHave[];
  excludeFamilies: Family[];
  maxPricePerKg: number | null;
  budgetPerPart: number | null;
  safetyClass: SafetyClass;
  safetyFactor: number | null;
  assumptions: string[];
  sourceText: string;
  /** What the part does, in one plain sentence. */
  function: string;
  customProperties: CustomProperty[];
  propertyLimits: PropertyLimit[];
  customObjective: CustomObjective | null;
}

export interface Question {
  field: string;
  question: string;
  options: { label: string; value: unknown }[];
  default?: unknown;
}

export interface ExtractResponse {
  spec: DesignSpec;
  questions: Question[];
  dataSource: DataSource;
}

export interface Material {
  id: string;
  name: string;
  family: Family;
  grade: string | null;
  density: Range | null;
  E: Range | null;
  G: Range | null;
  strength: Range | null;
  Kic: Range | null;
  tMax: Range | null;
  tMin: Range | null;
  lambda: Range | null;
  alpha: Range | null;
  price: Range | null;
  brittle: boolean;
  transparent: boolean;
  electricalInsulator: boolean;
  ratings: { fresh_water: Rating | null; salt_water: Rating | null; uv: Rating | null; chemicals: Rating | null };
  /** Suitability per custom environment, keyed by lower-cased text. */
  customRatings?: Record<string, Rating | null>;
  processes: Partial<Record<Process, ProcessRating>>;
  forms: string[];
  extra?: Record<string, Range | null>;
  sources?: string[];
  confidence: Confidence;
  notes: string;
}

export interface Sizing {
  dimension: string;
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
  indexValues: Record<string, number>;
  sizing: Sizing | null;
  processFit: Partial<Record<Process, ProcessRating>>;
  reasons: string[];
  dataFlags: string[];
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
  mode: 'sizing' | 'index';
  objectiveLabel: string;
  objectiveUnit: string;
  lowerIsBetter: boolean;
  index: { expression: string; description: string; cost: boolean };
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
  keySource?: 'server' | 'user' | 'none';
  explanations: Partial<Record<Audience, Explanation>>;
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

export interface Health {
  status: string;
  /** "anthropic" when the server has its own key. */
  llmProvider: 'anthropic' | 'mock';
  serverHasKey: boolean;
  acceptsUserKey: boolean;
  model: string;
  database: 'connected' | 'disconnected';
}
