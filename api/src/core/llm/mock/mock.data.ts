/**
 * Mock mode (LLM_PROVIDER=mock): rule-based extraction, built-in candidate materials and templated
 * explanations, so the whole app runs without an API key. Mirrors the shape of the Claude outputs.
 */
import {
  Audience,
  DesignSpec,
  DesignSpecInput,
  Family,
  Material,
  Process,
  Question,
  Environment,
} from 'src/common/domain/domain.types';
import { fmt, fmtUsd } from 'src/engine/labels';
import { ExplanationPayload } from 'src/core/selection/util/grounding.util';
import { MOCK_MATERIALS } from './mock.materials';
import { mapCustomEnvironments } from 'src/engine/environments';

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------
const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
const LOAD_RE = new RegExp(
  String.raw`${NUM}\s*(kg|kilos?|kilograms?|kn|n|newtons?|lbs?|pounds?)\b`,
  'gi',
);
const TORQUE_RE = new RegExp(
  String.raw`${NUM}\s*(n\s*[·.*-]?\s*m|nm|lbf?\s*[·.*-]?\s*ft)\b`,
  'gi',
);
const LEN_RE = new RegExp(
  String.raw`${NUM}\s*(mm|cm|m|metres?|meters?|in|inch|inches|ft|feet|foot|')(?![a-z²³])`,
  'gi',
);

const num = (s: string) => Number(s.replace(',', '.'));
const LEN_UNIT: Record<string, string> = {
  metre: 'm',
  metres: 'm',
  meter: 'm',
  meters: 'm',
  inch: 'in',
  inches: 'in',
  feet: 'ft',
  foot: 'ft',
  "'": 'ft',
};
const LOAD_UNIT: Record<string, string> = {
  kilo: 'kg',
  kilos: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  kn: 'kN',
  n: 'N',
  newton: 'N',
  newtons: 'N',
  lbs: 'lb',
  pound: 'lb',
  pounds: 'lb',
};
const toMm = (v: number, u: string) =>
  v * ({ mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 }[u] ?? 1);

interface Len {
  value: number;
  unit: string;
  mm: number;
  /** A few words before / after the number, lower-case. */
  before: string;
  after: string;
}

function lengths(text: string): Len[] {
  const out: Len[] = [];
  for (const m of text.matchAll(LEN_RE)) {
    const unitRaw = m[2].toLowerCase();
    const unit = LEN_UNIT[unitRaw] ?? unitRaw;
    const value = num(m[1]);
    const start = m.index ?? 0;
    const end = start + m[0].length;
    out.push({
      value,
      unit,
      mm: toMm(value, unit),
      before: text.slice(Math.max(0, start - 25), start).toLowerCase(),
      after: text.slice(end, end + 15).toLowerCase(),
    });
  }
  return out;
}

const isWidth = (l: Len) =>
  /^\s*(wide|deep|in width|in depth)\b/.test(l.after) ||
  /\b(width|depth|wide|deep)( of| is)?\s*$/.test(l.before);
const isDeflection = (l: Len) =>
  /\b(sag|bend|deflect|flex|droop|stretch)\w*( by| more than| over| of)?( no more than| at most| up to)?\s*$/.test(
    l.before,
  );

const TOOL_WORDS: [RegExp, Process][] = [
  [/hand ?saw|handsaw|jigsaw|hacksaw|\bsaw\b/i, 'hand_cut'],
  [
    /circular saw|angle grinder|grinder|power saw|mitre saw|table saw|band ?saw/i,
    'power_cut',
  ],
  [/drill/i, 'drill'],
  [/lathe|milling|\bmill\b|cnc/i, 'machine'],
  [/weld/i, 'weld'],
  [/glue|epoxy|adhesive/i, 'glue'],
  [/screw|bolt|rivet|nail/i, 'fasten'],
  [/\bbend(ing)?\b|press brake|sheet[- ]metal folder/i, 'bend'],
  [/3d[- ]?print/i, 'print_3d'],
  [/woodwork|carpentry|chisel|router|plane\b/i, 'woodwork'],
];

type Kind =
  | 'ladder'
  | 'shelf'
  | 'drone'
  | 'bench'
  | 'coolbox'
  | 'leg'
  | 'tie'
  | 'shaft'
  | 'brake'
  | 'heatsink'
  | 'generic'
  | 'custom';

const STRUCTURAL: Kind[] = [
  'ladder',
  'shelf',
  'drone',
  'bench',
  'leg',
  'tie',
  'shaft',
  'generic',
];

function kindOf(t: string, hasNumbers: boolean): Kind {
  if (/\bbrake|clutch|friction (pad|lining|material)/.test(t)) return 'brake';
  if (/heat ?sink|cooling fins?|heat spreader/.test(t)) return 'heatsink';
  if (/ladder|step ?stool/.test(t)) return 'ladder';
  if (/cool ?box|cooler|insulat|lunch ?box|ice ?box/.test(t)) return 'coolbox';
  if (/drone|quadcopter|multicopter|uav/.test(t)) return 'drone';
  if (/bench|seat|stool|chair/.test(t)) return 'bench';
  if (/shelf|shelves|bookcase|plank|board|desk|table ?top|worktop/.test(t))
    return 'shelf';
  if (/\bleg\b|legs|post|column|strut|prop/.test(t)) return 'leg';
  if (/rope|cable|hanger|tie rod|guy ?wire|tension/.test(t)) return 'tie';
  if (/shaft|axle|spindle|torque/.test(t)) return 'shaft';
  // A load or a length suggests a structural member; otherwise treat it as a general part chosen by its properties.
  return hasNumbers || /\b(beam|bracket|frame|support|span)\b/.test(t)
    ? 'generic'
    : 'custom';
}

/** "I want to design a brake pad for my bike" → "Brake pad". */
function guessTitle(text: string): string {
  const m = text
    .toLowerCase()
    .replace(/^(hi|hello|hey)[,!.\s]+/, '')
    .match(
      /(?:design|make|build|create|need|want)?\s*(?:an?|the|some)\s+([a-z][a-z -]{2,40}?)(?=\s+(?:for|that|which|to|with|in|on|so)\b|[,.!?]|$)/,
    );
  const t = (m?.[1] ?? text.split(/[,.!?]/)[0])
    .trim()
    .split(/\s+/)
    .slice(0, 5)
    .join(' ');
  return t ? t.charAt(0).toUpperCase() + t.slice(1, 60) : 'My part';
}

const TITLES: Record<Kind, string> = {
  ladder: 'Ladder side rail',
  shelf: 'Shelf board',
  drone: 'Drone arm',
  bench: 'Bench seat',
  coolbox: 'Cool box wall',
  leg: 'Support leg',
  tie: 'Tension member',
  shaft: 'Drive shaft',
  brake: 'Brake pad',
  heatsink: 'Heat sink',
  generic: 'Structural part',
  custom: 'My part',
};

/** Demo extraction: keyword idealisation + regex for loads, lengths and tools. */
export function mockExtract(
  text: string,
  audience: Audience,
): { spec: DesignSpecInput; questions: Question[] } {
  const t = text.toLowerCase();
  const hasNumbers =
    LOAD_RE.test(text) || new RegExp(LEN_RE.source, 'i').test(text);
  LOAD_RE.lastIndex = 0;
  const kind = kindOf(t, hasNumbers);
  const assumptions: string[] = [];
  const questions: Question[] = [];

  // --- loads --------------------------------------------------------------
  const loads = [...text.matchAll(LOAD_RE)].map((m) => ({
    value: num(m[1]),
    unit: LOAD_UNIT[m[2].toLowerCase()] ?? m[2].toLowerCase(),
  }));
  const torques = [...text.matchAll(TORQUE_RE)].map((m) => ({
    value: num(m[1]),
    unit: /lb/i.test(m[2]) ? 'lbf·ft' : 'N·m',
  }));
  let load: { value: number; unit: string } | null =
    kind === 'shaft'
      ? (torques[0] ?? null)
      : (loads.sort((a, b) => b.value - a.value)[0] ?? null);
  const people = /two (people|adults|persons)|2 (people|adults)/.test(t)
    ? 2
    : /three (people|adults)|3 (people|adults)/.test(t)
      ? 3
      : /person|people|adult|someone|me\b|stand|sit|climb/.test(t)
        ? 1
        : 0;
  if (!load && people && kind !== 'coolbox') {
    load = { value: 100 * people, unit: 'kg' };
    assumptions.push(
      `Load of ${100 * people} kg: ${people === 1 ? 'one person' : `${people} people`} at about 100 kg each.`,
    );
  }

  // --- lengths ----------------------------------------------------------------
  const lens = lengths(text);
  const widthLen = lens.find(isWidth);
  const deflLen = lens.find((l) => l !== widthLen && isDeflection(l));
  const spanCands = lens.filter((l) => l !== widthLen && l !== deflLen);
  const spanLen =
    spanCands.find((l) => /^\s*(long|span|length|tall|high)\b/.test(l.after)) ??
    spanCands.sort((a, b) => b.mm - a.mm)[0] ??
    null;

  const base: DesignSpecInput = {
    title: kind === 'custom' ? guessTitle(text) : TITLES[kind],
    audience,
    component: 'beam',
    objective: /cheap|budget|low cost|inexpensive|affordable/.test(t)
      ? 'min_cost'
      : 'min_mass',
    criteria: ['stiffness', 'strength'],
    load,
    length: spanLen ? { value: spanLen.value, unit: spanLen.unit } : null,
    maxDeflection: deflLen
      ? { value: deflLen.value, unit: deflLen.unit }
      : null,
    environment: [],
    requiredProcesses: TOOL_WORDS.filter(([re]) => re.test(text)).map(
      ([, p]) => p,
    ),
    sourceText: text,
    assumptions,
  };
  const explicitLight = /\b(light|lightweight|weight|portable|carry)\b/.test(t);
  const wantsCheap = base.objective === 'min_cost';
  const wantsGreen =
    /\b(eco|green|sustainable|low[- ]carbon|environment(al)?)\b/.test(t);
  // "weight" alone often means the load ("holds the weight of books"), so it doesn't count as a goal here.
  const wantsLight = /\b(light|lightweight|portable)\b/.test(t);
  const goalsNamed = [wantsLight, wantsCheap, wantsGreen].filter(
    Boolean,
  ).length;
  if (goalsNamed >= 2 || /\b(balance|balanced|trade[- ]?off)\b/.test(t)) {
    // DECISION: two or more goals named → Ashby's penalty function, with exchange constants by application.
    base.objective = 'balanced';
    const alphaMass = /\b(drone|uav|aircraft|plane)\b/.test(t)
      ? 100
      : /\b(bike|bicycle|car|vehicle|racing)\b/.test(t)
        ? 10
        : 1;
    const alphaCo2 = wantsGreen ? 0.2 : 0.1;
    base.penalty = {
      alphaMass,
      alphaCo2,
      rationale: `Typical values for this kind of product: $${alphaMass} per kg saved and $${alphaCo2 * 1000}/t CO₂e.`,
    };
    assumptions.push(
      `Goal is the best balance of cost, weight and carbon, valuing each kg saved at $${alphaMass} and carbon at $${alphaCo2 * 1000} per tonne.`,
    );
  } else if (wantsGreen) {
    base.objective = 'min_carbon';
    assumptions.push(
      'Goal is the lowest carbon footprint, because you asked for an eco-friendly part.',
    );
  } else if (base.objective === 'min_cost')
    assumptions.push(
      'Goal is the cheapest part, because you asked for low cost.',
    );
  else if (
    !explicitLight &&
    ['shelf', 'bench', 'leg', 'generic'].includes(kind)
  ) {
    // DECISION: for static furniture weight rarely matters, so the sensible default goal is cost.
    base.objective = 'min_cost';
    assumptions.push(
      'Goal is the cheapest part: it stays in place, so its weight hardly matters.',
    );
  }

  const env = new Set<Environment>();
  if (
    /\b(outdoors?|outside|garden|balcony|patio|yard|weather|rain|all year)\b/.test(
      t,
    )
  )
    env.add('outdoor');
  if (/\b(bathroom|shower|wet|pool|boat|lake|river)\b/.test(t)) env.add('wet');
  if (/\b(sea|seaside|seawater|marine|salt ?water|coast(al)?)\b/.test(t))
    env.add('marine');
  if (/\b(acids?|chemicals?|solvents?|lab|laboratory)\b/.test(t))
    env.add('chemical');
  if (/\b(food|drinks?|kitchen|cook\w*|lunch|picnic)\b/.test(t))
    env.add('food_contact');
  if (/\b(garage|shed)\b/.test(t) && !env.size) env.add('outdoor');
  if (!env.size) {
    env.add('indoor');
    assumptions.push('Used indoors (no outdoor or wet use mentioned).');
  }
  base.environment = [...env];
  if (env.has('outdoor') || env.has('marine')) {
    base.tempRangeC = [-20, 50];
    assumptions.push('Outdoor temperatures from -20 °C to 50 °C.');
  }

  const spanMm = spanLen?.mm ?? null;
  const setDeflection = (ratio: number, why: string) => {
    if (!base.maxDeflection && spanMm) {
      const mm = Math.round((spanMm / ratio) * 10) / 10;
      base.maxDeflection = { value: mm, unit: 'mm' };
      assumptions.push(
        `Allowed bending ${fmt(mm)} mm (span/${ratio}, ${why}).`,
      );
    }
  };

  switch (kind) {
    case 'ladder':
      Object.assign(base, {
        component: 'beam',
        support: 'simply_supported_center',
        section: 'square_tube',
        safetyClass: 'carries_people',
      });
      assumptions.push(
        'The critical part is a side rail, checked as a beam (ladder laid flat on its ends, person standing in the middle) — more severe than normal leaning use.',
      );
      if (base.load) {
        const per = {
          value: Math.round((base.load.value / 2) * 10) / 10,
          unit: base.load.unit,
        };
        assumptions.push(
          `The two side rails share the load, so each rail carries ${fmt(per.value)} ${per.unit}.`,
        );
        base.load = per;
      }
      assumptions.push(
        'Side rails are square tubes with outer size 15× the wall thickness.',
      );
      setDeflection(
        150,
        'a stiffness limit in the spirit of ladder bending tests',
      );
      break;
    case 'shelf': {
      Object.assign(base, {
        component: 'beam',
        support: 'simply_supported_uniform',
        section: 'rect_fixed_width',
        safetyClass: 'general',
      });
      if (widthLen)
        base.sectionWidth = { value: widthLen.value, unit: widthLen.unit };
      else {
        base.sectionWidth = { value: 250, unit: 'mm' };
        assumptions.push('Board width (depth) of 250 mm.');
      }
      assumptions.push(
        'The shelf is a board supported at both ends with the load spread evenly.',
      );
      setDeflection(200, 'a common limit so shelves do not visibly sag');
      break;
    }
    case 'bench':
      Object.assign(base, {
        component: 'beam',
        support: 'simply_supported_center',
        section: 'rect_fixed_width',
        safetyClass: 'carries_people',
      });
      if (widthLen)
        base.sectionWidth = { value: widthLen.value, unit: widthLen.unit };
      else {
        base.sectionWidth = { value: 400, unit: 'mm' };
        assumptions.push('Seat width (depth) of 400 mm.');
      }
      assumptions.push(
        'The seat is a board supported at both ends; the worst case is the load at the middle.',
      );
      setDeflection(200, 'so the seat does not feel springy');
      break;
    case 'drone':
      Object.assign(base, {
        component: 'beam',
        support: 'cantilever_end',
        section: 'round_tube',
        safetyClass: 'general',
      });
      if (load && load.unit === 'kg' && load.value <= 5)
        assumptions.push('The load is the motor thrust at the arm tip.');
      assumptions.push(
        'Each arm is a cantilever fixed at the body with the motor thrust at its tip.',
      );
      assumptions.push(
        'Arms are round tubes with outer diameter 15× the wall thickness.',
      );
      setDeflection(100, 'to keep the motors aligned');
      break;
    case 'coolbox':
      Object.assign(base, {
        component: 'insulation',
        criteria: ['stiffness', 'strength'],
        safetyClass: 'general',
        load: null,
        length: null,
      });
      base.environment = [
        ...new Set<Environment>([
          ...(base.environment as Environment[]),
          'food_contact',
        ]),
      ].filter((e) => e !== 'indoor');
      if (!base.environment.length) base.environment = ['food_contact'];
      base.tempRangeC = [-20, 60];
      assumptions.push(
        'The critical part is the insulating wall: ranked by how little heat it lets through.',
      );
      assumptions.push(
        'Contents and lid see -20 °C (ice packs) to 60 °C (hot car).',
      );
      break;
    case 'leg':
      Object.assign(base, {
        component: 'column',
        endCondition: 'pinned_pinned',
        section: 'square_tube',
        safetyClass: people ? 'carries_people' : 'general',
      });
      assumptions.push(
        'The leg is a column with both ends pinned (the conservative case for buckling).',
      );
      break;
    case 'tie':
      Object.assign(base, {
        component: 'tie',
        section: 'solid_round',
        criteria: ['strength'],
        safetyClass: /lift|hoist|hang/.test(t) ? 'lifting' : 'general',
      });
      assumptions.push('Sized for strength in tension only.');
      break;
    case 'shaft':
      Object.assign(base, {
        component: 'shaft',
        section: 'solid_round',
        criteria: ['strength'],
      });
      assumptions.push('Sized for torsional strength of a solid round shaft.');
      break;
    case 'brake':
      Object.assign(base, {
        component: 'custom',
        safetyClass: 'carries_people',
        load: null,
        length: null,
        maxDeflection: null,
        function:
          'Pressed against a spinning disc to slow it down, turning motion into heat.',
        customProperties: [
          {
            key: 'friction_coefficient',
            label: 'Friction coefficient',
            symbol: 'μ',
            unit: '',
            higherIsBetter: true,
          },
          {
            key: 'wear_rate',
            label: 'Specific wear rate',
            symbol: 'k',
            unit: 'mm³/N·m',
            higherIsBetter: false,
          },
        ],
        propertyLimits: [
          {
            property: 'friction_coefficient',
            min: 0.3,
            max: 0.5,
            reason: 'steady, predictable braking',
          },
          {
            property: 'tMax',
            min: 400,
            max: null,
            reason: 'pad surfaces get this hot under hard braking',
          },
        ],
        customObjective: {
          description:
            'Longest life: least material worn away per unit of braking work',
          terms: [{ property: 'wear_rate', exponent: -1 }],
        },
      });
      if (base.environment?.includes('indoor')) {
        base.environment = ['outdoor'];
        base.tempRangeC = [-20, 50];
        assumptions.splice(
          assumptions.indexOf(
            'Used indoors (no outdoor or wet use mentioned).',
          ),
          1,
        );
        assumptions.push(
          'Exposed to rain, road spray and winter cold (-20 °C).',
        );
      }
      assumptions.push(
        'A brake pad is chosen by how it grips and copes with heat, not by a load and span.',
      );
      assumptions.push(
        'Friction coefficient between 0.3 and 0.5 for steady, predictable braking.',
      );
      assumptions.push('Pad surface reaches about 400 °C under hard braking.');
      assumptions.push('Ranked by wear resistance, i.e. the longest pad life.');
      break;
    case 'heatsink':
      Object.assign(base, {
        component: 'custom',
        load: null,
        length: null,
        maxDeflection: null,
        function:
          'Draws heat out of an electronic part and spreads it into the air.',
        propertyLimits: [
          {
            property: 'tMax',
            min: 100,
            max: null,
            reason: 'electronics run up to about 100 °C',
          },
        ],
        customObjective:
          explicitLight || base.objective !== 'min_cost'
            ? {
                description: 'Moves the most heat for its weight',
                terms: [
                  { property: 'lambda', exponent: 1 },
                  { property: 'density', exponent: -1 },
                ],
              }
            : {
                description: 'Moves the most heat',
                terms: [{ property: 'lambda', exponent: 1 }],
              },
      });
      assumptions.push(
        'Ranked by thermal conductivity per kilogram (the heat it can spread for its weight).',
      );
      assumptions.push('Must keep working at 100 °C.');
      break;
    case 'custom':
      Object.assign(base, {
        component: 'custom',
        load: null,
        length: null,
        maxDeflection: null,
        function: '',
      });
      assumptions.push(
        'Ranked by what matters most for this part (answer the question above to change it); lightest by default.',
      );
      questions.push({
        field: 'customObjective',
        question: 'What matters most for this part?',
        options: [
          {
            label: 'Light',
            value: {
              description: 'Lightest material',
              terms: [{ property: 'density', exponent: -1 }],
            },
          },
          {
            label: 'Stiff but light',
            value: {
              description: 'Stiffest for its weight',
              terms: [
                { property: 'E', exponent: 1 },
                { property: 'density', exponent: -1 },
              ],
            },
          },
          {
            label: 'Strong but light',
            value: {
              description: 'Strongest for its weight',
              terms: [
                { property: 'strength', exponent: 1 },
                { property: 'density', exponent: -1 },
              ],
            },
          },
          {
            label: 'Tough (won’t crack)',
            value: {
              description: 'Most resistant to cracking',
              terms: [{ property: 'Kic', exponent: 1 }],
            },
          },
          {
            label: 'Survives heat',
            value: {
              description: 'Highest service temperature',
              terms: [{ property: 'tMax', exponent: 1 }],
            },
          },
          {
            label: 'Keeps heat in/out',
            value: {
              description: 'Best thermal insulator',
              terms: [{ property: 'lambda', exponent: -1 }],
            },
          },
        ],
        default: null,
      });
      break;
    default:
      Object.assign(base, {
        component: 'beam',
        support: 'simply_supported_center',
        section: 'solid_square',
      });
      assumptions.push(
        'Idealised as a beam supported at both ends with the load at the centre.',
      );
      setDeflection(250, 'a typical general-purpose limit');
  }
  // --- extra requirements stated in plain words (also what "Anything else?" sends) ---------------------
  const hot = [
    ...t.matchAll(
      /(?:surviv\w*|withstand\w*|up to|reach\w*|handle\w*|at|to|hot as|temperatures? of)\s*(-?\d+(?:\.\d+)?)\s*°?\s*c\b/g,
    ),
  ].map((m) => Number(m[1]));
  if (hot.length) {
    const tHi = Math.max(...hot);
    if (base.component === 'custom') {
      const others = (base.propertyLimits ?? []).filter(
        (l) => l.property !== 'tMax',
      );
      base.propertyLimits = [
        ...others,
        {
          property: 'tMax',
          min: tHi,
          max: null,
          reason: 'you said it must handle this temperature',
        },
      ];
    } else
      base.tempRangeC = [
        Math.min(base.tempRangeC?.[0] ?? 20, 20),
        Math.max(tHi, base.tempRangeC?.[1] ?? tHi),
      ];
    assumptions.push(`Must keep working at ${fmt(tHi)} °C.`);
  }
  const money = t.match(
    /(?:under|below|less than|max(?:imum)?|budget of|at most)\s*\$\s?(\d+(?:\.\d+)?)(\s*(?:\/|per)\s*kg)?/,
  );
  if (money) {
    if (money[2]) base.maxPricePerKg = Number(money[1]);
    else base.budgetPerPart = Number(money[1]);
    assumptions.push(
      money[2]
        ? `Material must cost at most $${money[1]} per kg.`
        : `Budget of $${money[1]} of material per part.`,
    );
  }
  const must = new Set(base.mustHave ?? []);
  if (/\b(transparent|see[- ]through|clear)\b/.test(t)) must.add('transparent');
  if (
    /\b(electrical(ly)? insulat\w*|non[- ]conductive|doesn'?t conduct|not conduct)/.test(
      t,
    )
  )
    must.add('electrical_insulator');
  if (/\b(shatter\w*|impact|drop\w*|won'?t break when hit)\b/.test(t))
    must.add('impact_resistant');
  base.mustHave = [...must];

  if (/\b(lift\w*|hoist|crane|hook|sling)\b/.test(t))
    base.safetyClass = 'lifting';
  if (base.safetyClass !== 'general' && kind !== 'brake')
    assumptions.push(
      'If it fails someone could get hurt, so a larger safety margin is used.',
    );
  if (kind === 'brake')
    assumptions.push(
      'Brakes are safety-critical: the result is guidance only.',
    );
  // Brittle materials are excluded for load-bearing parts that carry people or loads (they fail without warning).
  if (
    (base.safetyClass === 'carries_people' || base.safetyClass === 'lifting') &&
    STRUCTURAL.includes(kind)
  ) {
    base.mustHave = [
      ...new Set([...(base.mustHave ?? []), 'impact_resistant' as const]),
    ];
    assumptions.push(
      'Brittle materials are excluded: they break suddenly, without bending first, which is dangerous for this use.',
    );
  }

  // --- questions: only what a structural part needs to be sized; everything else is an assumption ---------
  const sized = STRUCTURAL.includes(kind);
  if (sized && !base.load) {
    questions.push({
      field: 'load',
      question: 'Roughly how much load does it carry?',
      options: [
        { label: '20 kg', value: { value: 20, unit: 'kg' } },
        { label: '100 kg (one person)', value: { value: 100, unit: 'kg' } },
        { label: '200 kg (two people)', value: { value: 200, unit: 'kg' } },
      ],
      default: null,
    });
  }
  if (sized && !base.length) {
    const opts =
      kind === 'drone'
        ? [15, 20, 30].map((v) => ({
            label: `${v} cm`,
            value: { value: v, unit: 'cm' },
          }))
        : kind === 'ladder'
          ? [2, 3, 4].map((v) => ({
              label: `${v} m`,
              value: { value: v, unit: 'm' },
            }))
          : [0.6, 1, 1.5].map((v) => ({
              label: `${v} m`,
              value: { value: v, unit: 'm' },
            }));
    questions.push({
      field: 'length',
      question:
        kind === 'ladder'
          ? 'How long is the ladder?'
          : 'How long is it between supports?',
      options: opts,
      default: null,
    });
  }
  if (!base.requiredProcesses?.length)
    assumptions.push(
      'No tool restrictions: assumed you will buy it ready-made or have it made.',
    );
  return { spec: base, questions: questions.slice(0, 2) };
}

// ---------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------
/** DECISION: the demo set is fixed and curated, so every demo material of the family is returned (count is ignored). */
export function mockCandidates(
  family: Family,
  _count: number,
): Omit<Material, 'id'>[] {
  return MOCK_MATERIALS.filter((m) => m.family === family);
}

/** Custom properties some demo material has values for. */
export const DEMO_EXTRA_KEYS = new Set(
  MOCK_MATERIALS.flatMap((m) => Object.keys(m.extra)),
);

/**
 * Adapt a spec to what the demo data can check: custom environments → closest built-in ones, and custom
 * properties the demo set has no values for are dropped. Every change is reported to the user.
 */
export function demoAdjust(spec: DesignSpec): {
  spec: DesignSpec;
  notes: string[];
} {
  const mapped = mapCustomEnvironments(spec);
  const notes = [...mapped.notes];
  let s = mapped.spec;
  const missing = s.customProperties.filter((p) => !DEMO_EXTRA_KEYS.has(p.key));
  if (missing.length) {
    const drop = new Set(missing.map((p) => p.key));
    const terms =
      s.customObjective?.terms.filter((t) => !drop.has(t.property)) ?? [];
    s = {
      ...s,
      customProperties: s.customProperties.filter((p) => !drop.has(p.key)),
      propertyLimits: s.propertyLimits.filter((l) => !drop.has(l.property)),
      customObjective:
        s.customObjective && terms.length
          ? { ...s.customObjective, terms }
          : null,
    };
    notes.push(
      `The demo data has no values for ${missing.map((p) => p.label.toLowerCase()).join(', ')}, so ${missing.length > 1 ? 'those requirements were' : 'that requirement was'} not checked. Add a Claude API key to have every material rated for ${missing.length > 1 ? 'them' : 'it'}.`,
    );
  }
  return { spec: s, notes };
}

// ---------------------------------------------------------------------------
// Explanations (templated from the payload, so every number is grounded)
// ---------------------------------------------------------------------------
type Ranked = ExplanationPayload['ranked'][number];

const nameOf = (r: { name: string; grade: string | null }) =>
  r.grade ? `${r.name} (${r.grade})` : r.name;
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

function headline(r: Ranked, p: ExplanationPayload): string {
  if (p.mode === 'sizing' && r.size) {
    const value =
      p.objective.unit === 'USD eq.'
        ? `penalty about ${fmtUsd(r.objectiveValue ?? 0)}`
        : p.objective.unit === 'USD'
          ? `about ${fmtUsd(r.objectiveValue ?? 0)} of material`
          : `about ${fmt(r.size.massKg ?? 0)} kg`;
    return `${r.size.description}, ${value}`;
  }
  return `${fmt(r.objectiveValue ?? 0)}% of the best performance index`;
}

export function mockExplanation(
  p: ExplanationPayload,
  audience: Audience,
): string {
  const out: string[] = [];
  const [top, ...rest] = p.ranked;
  const alts = rest.slice(0, 2);
  const whyNot = p.ruledOut.slice(0, 3);

  if (!top) {
    out.push('## No material fits every requirement');
    out.push(
      `None of the ${p.counts.considered} candidates met all of your requirements. Here is what ruled out some of them:`,
    );
    for (const r of p.ruledOut.slice(0, 4))
      out.push(`- **${r.name}**: ${lowerFirst(r.reasons[0])}`);
    out.push(
      'Try relaxing the strictest requirement — usually the tool list, the environment or the budget — and run again.',
    );
  } else {
    out.push(audience === 'engineer' ? '## Recommendation' : '## Our pick');
    if (audience === 'craftsman') {
      out.push(`Go with **${nameOf(top)}**. ${top.reasons[0]}.`);
    } else if (audience === 'everyday') {
      out.push(
        `The best choice is **${nameOf(top)}**. Out of ${p.counts.considered} materials we looked at, ${p.counts.fit} can do the job, and this one ${
          p.mode === 'sizing' && top.size
            ? p.objective.unit === 'USD eq.'
              ? `gives the best balance of cost, weight and carbon — a penalty of about ${fmtUsd(top.objectiveValue ?? 0)}`
              : p.objective.unit === 'USD'
                ? `does it for the least money — about ${fmtUsd(top.objectiveValue ?? 0)} of material`
                : `does it with the least weight — about ${fmt(top.size.massKg ?? 0)} kg`
            : 'scores highest on the performance index'
        }.`,
      );
    } else if (p.mode === 'sizing') {
      out.push(
        `**${nameOf(top)}** ranks first on ${lowerFirst(p.objective.label)} (${headline(top, p)}).`,
      );
    } else {
      out.push(
        `**${nameOf(top)}** scores highest on the material index ${p.index.expression} — ${lowerFirst(p.index.description)}.`,
      );
    }
    if (top.size) {
      const gov = top.size.governedBy;
      if (audience === 'craftsman')
        out.push(
          `## What to buy\n- **${top.size.description}**\n- About ${fmt(top.size.massKg ?? 0)} kg of material${top.size.materialCostUsd ? `, roughly ${fmtUsd(top.size.materialCostUsd[0] ?? 0)}–${fmtUsd(top.size.materialCostUsd[1] ?? 0)}` : ''}.\n- The size is set by ${gov}.`,
        );
      else if (audience === 'everyday')
        out.push(
          `You would need a **${top.size.description}**. What decides the size is ${gov} — think of it as the weakest link the part has to cope with.`,
        );
      else
        out.push(
          `Required section: ${top.size.description}; the size is governed by ${gov}.`,
        );
    }
    out.push(
      audience === 'everyday'
        ? `In ${top.chanceBestPercent}% of ${fmt(p.monteCarloSamples)} "what if" runs (where each property was varied across its likely range) it came out on top.`
        : `It was the best choice in ${top.chanceBestPercent}% of ${fmt(p.monteCarloSamples)} Monte Carlo runs and in the top 3 in ${top.chanceTop3Percent}%.`,
    );

    if (alts.length) {
      out.push('## Good alternatives');
      for (const a of alts)
        out.push(
          `- **${nameOf(a)}** — ${a.size ? a.size.description + '; ' : ''}${lowerFirst(a.reasons[0])}.`,
        );
    }
    if (whyNot.length) {
      out.push(
        audience === 'everyday'
          ? '## Why not the usual suspects?'
          : '## Why not these?',
      );
      for (const r of whyNot)
        out.push(`- **${r.name}**: ${lowerFirst(r.reasons[0])}.`);
    }
    if (audience === 'craftsman') {
      out.push('## Working with it');
      const tools = Object.entries(top.tools)
        .map(([k, v]) => `${k.replace('_', ' ')} (${v})`)
        .join(', ');
      out.push(
        `${tools ? `With your tools: ${tools}. ` : ''}Measure twice and deburr or sand every cut edge. Pre-drill fixing holes and keep them away from the ends, and protect any cut or drilled surface with the finish the supplier recommends.`,
      );
    }
    if (audience === 'engineer') {
      out.push('## Method');
      out.push(
        p.design.component === 'custom'
          ? `- **Function:** ${p.design.function ?? 'general part'} The material is chosen by its properties, not by a load case.`
          : `- **Idealisation:** ${p.design.component}${p.mode === 'sizing' && p.design.section ? `, ${p.design.section.replace(/_/g, ' ')} section` : ''}.`,
      );
      out.push(`- **Constraints:** ${p.constraints.join('; ')}.`);
      out.push(
        p.mode === 'sizing'
          ? `- **Safety factor:** ${fmt(p.safetyFactor ?? 1)}, applied to strength and buckling; sizes use the weak end of each E and strength range.`
          : '- **Conservative scoring:** each material is scored at the end of its property ranges that makes the index worse.',
      );
      out.push(
        `- **Index:** ${p.index.expression} — ${lowerFirst(p.index.description)}.`,
      );
      out.push(
        `- **Uncertainty:** each property was sampled log-uniformly within its range (${fmt(p.monteCarloSamples)} samples, independent). Read the chance of being best and the p10–p90 range together: a close race means either option is defensible.`,
      );
    }
  }

  out.push('## Please check');
  out.push(
    'Property values are AI-estimated typical ranges that vary by grade, supplier and processing — confirm them with the supplier datasheet before you buy.',
  );
  for (const n of p.safetyNotes) out.push(`> ⚠️ **Safety:** ${n}`);
  return out.join('\n\n');
}
