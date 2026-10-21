/**
 * JSON Schemas for Claude's structured outputs, plus zod schemas that validate (and normalise) what comes back.
 *
 * Structured-output schemas must set `additionalProperties: false` on every object, list every property
 * as required, and avoid numeric/length constraints — so nullability is expressed with anyOf, ranges are
 * {min, max} objects, and question option values are JSON-encoded strings. Bounds are enforced afterwards
 * in zod and in the engine's plausibility checks.
 */
import { z } from 'zod';
import {
  AUDIENCES,
  COMPONENTS,
  CONFIDENCES,
  CRITERIA,
  END_CONDITIONS,
  ENVIRONMENTS,
  FAMILIES,
  MUST_HAVES,
  OBJECTIVES,
  PROCESSES,
  PROCESS_RATINGS,
  RATINGS,
  SAFETY_CLASSES,
  SECTIONS,
  SUPPORTS,
  Family,
  Material,
  PROPERTY_KEYS,
  RECYCLABILITY,
  normEnv,
  Question,
} from 'src/common/domain/domain.types';

type Json = Record<string, unknown>;

const obj = (properties: Record<string, Json>, description?: string): Json => ({
  type: 'object',
  ...(description ? { description } : {}),
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const nullable = (schema: Json): Json => ({
  anyOf: [schema, { type: 'null' }],
});
const str = (description?: string): Json => ({
  type: 'string',
  ...(description ? { description } : {}),
});
const num = (description?: string): Json => ({
  type: 'number',
  ...(description ? { description } : {}),
});
const bool = (description?: string): Json => ({
  type: 'boolean',
  ...(description ? { description } : {}),
});
const enumOf = (values: readonly string[], description?: string): Json => ({
  type: 'string',
  enum: [...values],
  ...(description ? { description } : {}),
});
const arr = (items: Json, description?: string): Json => ({
  type: 'array',
  items,
  ...(description ? { description } : {}),
});

const quantity = (description: string) =>
  nullable(obj({ value: num('positive number'), unit: str() }, description));
const range = (description: string) =>
  nullable(
    obj(
      { min: num(), max: num() },
      `${description}. Use null when unknown — never guess.`,
    ),
  );

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------
export const EXTRACTION_SCHEMA: Json = obj({
  spec: obj({
    title: str('Short name of the part, e.g. "Ladder side rail"'),
    audience: enumOf(AUDIENCES),
    component: enumOf(COMPONENTS, 'How the critical part is loaded'),
    objective: enumOf(OBJECTIVES),
    criteria: arr(enumOf(CRITERIA), 'One or both'),
    load: quantity(
      "Load in the user's unit: N, kN, kg, lb; for a shaft a torque in N·m or lbf·ft",
    ),
    length: quantity('Span / length in mm, cm, m, in or ft'),
    maxDeflection: quantity(
      'Allowed bending (beam) or stretch (tie), length unit',
    ),
    maxTwistDeg: nullable(num('Shaft twist limit in degrees')),
    support: enumOf(SUPPORTS),
    endCondition: enumOf(END_CONDITIONS),
    section: enumOf(SECTIONS),
    sectionWidth: quantity('Board/panel width for rect_fixed_width'),
    tubeRatio: num('Tube outer size ÷ wall thickness, default 15'),
    environment: arr(enumOf(ENVIRONMENTS)),
    customEnvironments: arr(
      str(),
      'Conditions that none of the listed environments describe, in a few words each (e.g. "near a chlorinated swimming pool", "inside a sauna"). Usually empty.',
    ),
    tempRangeC: nullable(
      obj({ min: num(), max: num() }, 'Service temperature range in °C'),
    ),
    requiredProcesses: arr(
      enumOf(PROCESSES),
      'Only tools/processes the user said they have',
    ),
    mustHave: arr(enumOf(MUST_HAVES)),
    excludeFamilies: arr(enumOf(FAMILIES)),
    maxPricePerKg: nullable(num('USD per kg')),
    budgetPerPart: nullable(num('USD')),
    safetyClass: enumOf(SAFETY_CLASSES),
    safetyFactor: nullable(num('Only if the user stated one')),
    assumptions: arr(str(), 'Every default you applied, in plain language'),
    country: nullable(
      str(
        'Two-letter ISO 3166-1 code of the country the user says they are in or will buy in (e.g. "NG", "GB"); null if not stated',
      ),
    ),
    function: str('What the part does, in one plain sentence'),
    penalty: nullable(
      obj(
        {
          alphaMass: num('USD the user would pay to save 1 kg of part mass'),
          alphaCo2: num('USD per kg CO₂e (carbon price ÷ 1000)'),
          rationale: str('One short plain sentence on why these values'),
        },
        'Exchange constants for objective "balanced"; null for any other objective',
      ),
    ),
    customProperties: arr(
      obj({
        key: str('snake_case id, e.g. friction_coefficient'),
        label: str('Plain name, e.g. "Friction coefficient (vs cast iron)"'),
        symbol: str('Short symbol, e.g. "μ"; empty if none'),
        unit: str('Unit, e.g. "–", "HV", "mm³/N·m", "J/kg·K"'),
        higherIsBetter: bool(),
      }),
      'Application-specific properties the standard ones do not cover (at most 4); empty for ordinary structural parts',
    ),
    propertyLimits: arr(
      obj({
        property: str(
          `One of: ${PROPERTY_KEYS.join(', ')}, or a customProperties key`,
        ),
        min: nullable(num()),
        max: nullable(num()),
        reason: str('Why, in a few plain words'),
      }),
      'Hard requirements on material properties, in the standard units (at most 8)',
    ),
    customObjective: nullable(
      obj({
        description: str(
          'What the index rewards, in plain words, e.g. "high friction that survives heat"',
        ),
        terms: arr(
          obj({
            property: str('Standard or custom property key'),
            exponent: num('e.g. 1, -1, 0.5, 2'),
          }),
        ),
      }),
    ),
  }),
  questions: arr(
    obj({
      field: enumOf([
        'load',
        'length',
        'maxDeflection',
        'maxTwistDeg',
        'requiredProcesses',
        'environment',
        'sectionWidth',
        'tempRangeC',
        'section',
        'support',
      ]),
      question: str(),
      options: arr(
        obj({
          label: str(),
          value_json: str(
            'The exact JSON value written into the spec field, e.g. {"value":100,"unit":"kg"} or ["drill","hand_cut"]',
          ),
        }),
      ),
      default_json: str(
        'JSON value of the option used if the user does not answer',
      ),
    }),
    'At most 3 questions, only ones that change the result',
  ),
});

const RangeObj = z.object({ min: z.number(), max: z.number() });
const Qty = z.object({ value: z.number(), unit: z.string() }).nullable();

const parseJson = (s: string, ctx: z.RefinementCtx): unknown => {
  try {
    return JSON.parse(s);
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `not valid JSON: ${s.slice(0, 60)}`,
    });
    return z.NEVER;
  }
};

/** Validates Claude's extraction output and maps it onto the DesignSpec input shape. */
export const ExtractionOutput = z.object({
  spec: z
    .object({
      title: z.string(),
      audience: z.enum(AUDIENCES),
      component: z.enum(COMPONENTS),
      objective: z.enum(OBJECTIVES),
      criteria: z.array(z.enum(CRITERIA)),
      load: Qty,
      length: Qty,
      maxDeflection: Qty,
      maxTwistDeg: z.number().nullable(),
      support: z.enum(SUPPORTS),
      endCondition: z.enum(END_CONDITIONS),
      section: z.enum(SECTIONS),
      sectionWidth: Qty,
      tubeRatio: z.number(),
      environment: z.array(z.enum(ENVIRONMENTS)),
      customEnvironments: z.array(z.string()).default([]),
      tempRangeC: RangeObj.nullable(),
      requiredProcesses: z.array(z.enum(PROCESSES)),
      mustHave: z.array(z.enum(MUST_HAVES)),
      excludeFamilies: z.array(z.enum(FAMILIES)),
      maxPricePerKg: z.number().nullable(),
      budgetPerPart: z.number().nullable(),
      safetyClass: z.enum(SAFETY_CLASSES),
      safetyFactor: z.number().nullable(),
      assumptions: z.array(z.string()),
      country: z
        .string()
        .nullable()
        .default(null)
        .transform((c) =>
          c && /^[a-z]{2}$/i.test(c.trim()) ? c.trim().toUpperCase() : null,
        ),
      function: z.string().default(''),
      penalty: z
        .object({
          alphaMass: z.number().min(0),
          alphaCo2: z.number().min(0),
          rationale: z.string().transform((r) => r.slice(0, 240)),
        })
        .nullable()
        .default(null),
      customProperties: z
        .array(
          z.object({
            key: z.string(),
            label: z.string(),
            symbol: z.string(),
            unit: z.string(),
            higherIsBetter: z.boolean(),
          }),
        )
        .default([]),
      propertyLimits: z
        .array(
          z.object({
            property: z.string(),
            min: z.number().nullable(),
            max: z.number().nullable(),
            reason: z.string(),
          }),
        )
        .default([]),
      customObjective: z
        .object({
          description: z.string(),
          terms: z.array(
            z.object({ property: z.string(), exponent: z.number() }),
          ),
        })
        .nullable()
        .default(null),
    })
    .transform(({ tempRangeC, ...s }) => ({
      ...s,
      tempRangeC: tempRangeC
        ? ([tempRangeC.min, tempRangeC.max] as [number, number])
        : null,
    })),
  questions: z
    .array(
      z.object({
        field: z.string(),
        question: z.string(),
        options: z.array(
          z.object({ label: z.string(), value_json: z.string() }),
        ),
        default_json: z.string(),
      }),
    )
    .transform((qs, ctx): Question[] =>
      qs.slice(0, 3).map((q) => ({
        field: q.field,
        question: q.question,
        options: q.options.slice(0, 6).map((o) => ({
          label: o.label,
          value: parseJson(o.value_json, ctx),
        })),
        default: parseJson(q.default_json, ctx),
      })),
    ),
});

// ---------------------------------------------------------------------------
// Candidate materials
// ---------------------------------------------------------------------------
const RANGE_DESCRIPTIONS: Record<(typeof PROPERTY_KEYS)[number], string> = {
  density: 'Density, kg/m³',
  E: "Young's modulus, GPa",
  G: 'Shear modulus, GPa',
  strength:
    'Strength, MPa: yield strength for metals and polymers; modulus of rupture (bending strength) for wood, glass, ceramics, stone, concrete; tensile strength for composites along the main fibre direction',
  Kic: 'Fracture toughness, MPa·√m',
  tMax: 'Maximum continuous service temperature, °C',
  tMin: 'Minimum service temperature, °C',
  lambda: 'Thermal conductivity, W/m·K',
  alpha: 'Thermal expansion coefficient, µstrain/K',
  price: 'Typical bulk price of the raw stock, USD/kg',
  co2: 'Cradle-to-gate carbon footprint of the raw material (typical virgin production, global average), kg CO₂e per kg',
  embodiedEnergy:
    'Cradle-to-gate embodied (primary) energy of the raw material, MJ per kg',
};

const ratingField = (what: string) =>
  nullable(
    enumOf(
      RATINGS,
      `${what}: A excellent, B good, C average, D poor, E unacceptable`,
    ),
  );

export const CANDIDATE_SCHEMA: Json = obj({
  materials: arr(
    obj({
      name: str('Common commercial name, e.g. "Aluminium alloy 6061-T6"'),
      family: enumOf(FAMILIES),
      grade: nullable(
        str('Grade / designation if any, e.g. "6061-T6", "S235", "C24"'),
      ),
      ...Object.fromEntries(
        PROPERTY_KEYS.map((k) => [k, range(RANGE_DESCRIPTIONS[k])]),
      ),
      brittle: bool(
        'True for glass, ceramics, stone, cast iron, unreinforced brittle polymers',
      ),
      transparent: bool(),
      electricalInsulator: bool(),
      ratings: obj({
        fresh_water: ratingField('Durability in fresh water / rain'),
        salt_water: ratingField('Durability in sea water'),
        uv: ratingField('Durability in sunlight (UV)'),
        chemicals: ratingField(
          'Resistance to weak acids, alkalis and common solvents',
        ),
      }),
      customRatings: arr(
        obj({
          environment: str(
            'Exactly one of the custom environments listed in the request',
          ),
          rating: ratingField(
            'Suitability for that environment without extra protection',
          ),
        }),
        'One entry per custom environment in the request, in the same order; empty if there are none',
      ),
      processes: obj(
        Object.fromEntries(PROCESSES.map((p) => [p, enumOf(PROCESS_RATINGS)])),
        'How practical each process is for this material in a typical workshop',
      ),
      forms: arr(
        str(),
        'Stock forms sold, e.g. "sheet", "round tube", "square tube", "bar", "plank", "filament"',
      ),
      extraProperties: arr(
        obj({
          key: str(
            'Exactly one of the extra property keys listed in the request',
          ),
          min: nullable(num()),
          max: nullable(num()),
        }),
        'One entry per extra property requested, in its unit; min/max null when unknown. Empty if none were requested.',
      ),
      sources: arr(
        str(),
        'Up to 3 references these values typically come from (handbook, standard, datasheet or paper). Only cite sources you are confident exist; empty if unsure.',
      ),
      recyclability: nullable(
        enumOf(
          RECYCLABILITY,
          'How practical it is to recycle at end of life with existing infrastructure',
        ),
      ),
      renewable: nullable(
        bool('True if made from a renewable (biological) source'),
      ),
      biodegradable: nullable(
        bool('True if it biodegrades in normal composting or soil conditions'),
      ),
      criticalElements: arr(
        str(),
        'Raw materials/elements it contains in significant amounts (e.g. "titanium", "vanadium", "aluminium", "copper", "nickel", "cobalt", "magnesium", "manganese", "boron"); empty for none',
      ),
      hazards: arr(
        str(),
        'Up to 3 short health or safety hazards in making or using it (e.g. "fine dust when cutting — wear a mask"); empty if none notable',
      ),
      processingTips: arr(
        str(),
        'Up to 4 short practical tips for working it: cutting, joining, finishing, what to avoid',
      ),
      confidence: enumOf(
        CONFIDENCES,
        'Your confidence in these property values',
      ),
      notes: str(
        'One short sentence: what it is commonly used for or its main caveat',
      ),
    }),
  ),
});

const RangeOrNull = RangeObj.nullable();
const RatingOrNull = z.enum(RATINGS).nullable();

export const CandidateOutputItem = z.object({
  name: z.string().min(1),
  family: z.enum(FAMILIES),
  grade: z.string().nullable(),
  density: RangeOrNull,
  E: RangeOrNull,
  G: RangeOrNull,
  strength: RangeOrNull,
  Kic: RangeOrNull,
  tMax: RangeOrNull,
  tMin: RangeOrNull,
  lambda: RangeOrNull,
  alpha: RangeOrNull,
  price: RangeOrNull,
  co2: RangeOrNull.default(null),
  embodiedEnergy: RangeOrNull.default(null),
  brittle: z.boolean(),
  transparent: z.boolean(),
  electricalInsulator: z.boolean(),
  ratings: z.object({
    fresh_water: RatingOrNull,
    salt_water: RatingOrNull,
    uv: RatingOrNull,
    chemicals: RatingOrNull,
  }),
  customRatings: z
    .array(z.object({ environment: z.string(), rating: RatingOrNull }))
    .default([]),
  extraProperties: z
    .array(
      z.object({
        key: z.string(),
        min: z.number().nullable(),
        max: z.number().nullable(),
      }),
    )
    .default([]),
  sources: z.array(z.string()).default([]),
  recyclability: z.enum(RECYCLABILITY).nullable().default(null),
  renewable: z.boolean().nullable().default(null),
  biodegradable: z.boolean().nullable().default(null),
  criticalElements: z.array(z.string()).default([]),
  hazards: z.array(z.string()).default([]),
  processingTips: z.array(z.string()).default([]),
  processes: z.record(z.enum(PROCESSES), z.enum(PROCESS_RATINGS)),
  forms: z.array(z.string()),
  confidence: z.enum(CONFIDENCES),
  notes: z.string(),
});
/** maxItems is not expressible in structured outputs, so the 25-item cap (§6.2) is applied here. */
export const CandidateOutput = z.object({
  materials: z.array(CandidateOutputItem).transform((m) => m.slice(0, 25)),
});
export type CandidateOutputItem = z.infer<typeof CandidateOutputItem>;

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

/** Convert Claude's material objects into domain Materials with stable, unique ids. */
export function toMaterials(
  items: CandidateOutputItem[],
  family: Family,
  usedIds: Set<string>,
  customEnvironments: string[] = [],
  extraKeys: string[] = [],
): Material[] {
  const out: Material[] = [];
  for (const it of items) {
    if (it.family !== family) continue; // §6.2: drop materials whose family doesn't match the request
    const base =
      slug(`${family}-${it.name}-${it.grade ?? ''}`) || `${family}-material`;
    let id = base;
    for (let n = 2; usedIds.has(id); n++) id = `${base}-${n}`;
    usedIds.add(id);
    const r = (x: { min: number; max: number } | null) =>
      x ? ([x.min, x.max] as [number, number]) : null;
    out.push({
      id,
      name: it.name.trim().slice(0, 120),
      family: it.family,
      grade: it.grade?.trim().slice(0, 80) || null,
      density: r(it.density),
      E: r(it.E),
      G: r(it.G),
      strength: r(it.strength),
      Kic: r(it.Kic),
      tMax: r(it.tMax),
      tMin: r(it.tMin),
      lambda: r(it.lambda),
      alpha: r(it.alpha),
      price: r(it.price),
      co2: r(it.co2),
      embodiedEnergy: r(it.embodiedEnergy),
      brittle: it.brittle,
      transparent: it.transparent,
      electricalInsulator: it.electricalInsulator,
      ratings: it.ratings,
      customRatings: matchCustomRatings(it.customRatings, customEnvironments),
      extra: Object.fromEntries(
        extraKeys.map((k) => {
          const e = it.extraProperties.find((x) => x.key === k);
          return [
            k,
            e && e.min !== null && e.max !== null
              ? ([e.min, e.max] as [number, number])
              : null,
          ];
        }),
      ),
      sources: it.sources.slice(0, 3).map((x) => x.slice(0, 240)),
      recyclability: it.recyclability,
      renewable: it.renewable,
      biodegradable: it.biodegradable,
      criticalElements: it.criticalElements
        .slice(0, 12)
        .map((x) => x.slice(0, 40)),
      hazards: it.hazards.slice(0, 3).map((x) => x.slice(0, 160)),
      processingTips: it.processingTips.slice(0, 4).map((x) => x.slice(0, 220)),
      processes: it.processes,
      forms: it.forms.slice(0, 12).map((f) => f.slice(0, 80)),
      confidence: it.confidence,
      notes: it.notes.slice(0, 600),
    });
  }
  return out;
}

/**
 * Key Claude's per-environment ratings by the user's own wording. Matches by text first; if Claude
 * paraphrased an environment, falls back to the position (the prompt asks for the same order).
 */
export function matchCustomRatings(
  given: { environment: string; rating: Material['customRatings'][string] }[],
  customEnvironments: string[],
): Material['customRatings'] {
  const byText = new Map(given.map((g) => [normEnv(g.environment), g.rating]));
  const out: Material['customRatings'] = {};
  customEnvironments.forEach((env, i) => {
    const key = normEnv(env);
    const r = byText.has(key)
      ? byText.get(key)
      : given.length === customEnvironments.length
        ? given[i]?.rating
        : undefined;
    if (r !== undefined) out[key] = r;
  });
  return out;
}
