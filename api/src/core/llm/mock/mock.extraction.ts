// Rule-based extraction for demo mode: keywords pick the kind of part, regexes find loads, lengths and tools.
import {
  Audience,
  DesignSpecInput,
  Environment,
  Process,
  Question,
} from 'src/common/domain/domain.types';
import { formatNumber } from 'src/engine/labels';

const NUMBER = String.raw`(\d+(?:[.,]\d+)?)`;
const LOAD_RE = new RegExp(
  String.raw`${NUMBER}\s*(kg|kilos?|kilograms?|kn|n|newtons?|lbs?|pounds?)\b`,
  'gi',
);
const TORQUE_RE = new RegExp(
  String.raw`${NUMBER}\s*(n\s*[·.*-]?\s*m|nm|lbf?\s*[·.*-]?\s*ft)\b`,
  'gi',
);
const LENGTH_RE = new RegExp(
  String.raw`${NUMBER}\s*(mm|cm|m|metres?|meters?|in|inch|inches|ft|feet|foot|')(?![a-z²³])`,
  'gi',
);

const parseNumber = (s: string) => Number(s.replace(',', '.'));
const LENGTH_UNIT_ALIASES: Record<string, string> = {
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
const LOAD_UNIT_ALIASES: Record<string, string> = {
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

interface FoundLength {
  value: number;
  unit: string;
  mm: number;
  // A few lower-case words either side of the number.
  before: string;
  after: string;
}

function findLengths(text: string): FoundLength[] {
  const out: FoundLength[] = [];
  for (const m of text.matchAll(LENGTH_RE)) {
    const unitRaw = m[2].toLowerCase();
    const unit = LENGTH_UNIT_ALIASES[unitRaw] ?? unitRaw;
    const value = parseNumber(m[1]);
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

const isWidth = (l: FoundLength) =>
  /^\s*(wide|deep|in width|in depth)\b/.test(l.after) ||
  /\b(width|depth|wide|deep)( of| is)?\s*$/.test(l.before);
const isDeflection = (l: FoundLength) =>
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

type PartKind =
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

const STRUCTURAL_KINDS: PartKind[] = [
  'ladder',
  'shelf',
  'drone',
  'bench',
  'leg',
  'tie',
  'shaft',
  'generic',
];

function partKindOf(lowerText: string, hasNumbers: boolean): PartKind {
  if (/\bbrake|clutch|friction (pad|lining|material)/.test(lowerText))
    return 'brake';
  if (/heat ?sink|cooling fins?|heat spreader/.test(lowerText))
    return 'heatsink';
  if (/ladder|step ?stool/.test(lowerText)) return 'ladder';
  if (/cool ?box|cooler|insulat|lunch ?box|ice ?box/.test(lowerText))
    return 'coolbox';
  if (/drone|quadcopter|multicopter|uav/.test(lowerText)) return 'drone';
  if (/bench|seat|stool|chair/.test(lowerText)) return 'bench';
  if (
    /shelf|shelves|bookcase|plank|board|desk|table ?top|worktop/.test(lowerText)
  )
    return 'shelf';
  if (/\bleg\b|legs|post|column|strut|prop/.test(lowerText)) return 'leg';
  if (/rope|cable|hanger|tie rod|guy ?wire|tension/.test(lowerText))
    return 'tie';
  if (/shaft|axle|spindle|torque/.test(lowerText)) return 'shaft';
  // A load or a length suggests a structural member; otherwise treat it as a general part chosen by its properties.
  return hasNumbers || /\b(beam|bracket|frame|support|span)\b/.test(lowerText)
    ? 'generic'
    : 'custom';
}

// Turns "I want to design a brake pad for my bike" into "Brake pad".
function guessTitle(text: string): string {
  const m = text
    .toLowerCase()
    .replace(/^(hi|hello|hey)[,!.\s]+/, '')
    .match(
      /(?:design|make|build|create|need|want)?\s*(?:an?|the|some)\s+([a-z][a-z -]{2,40}?)(?=\s+(?:for|that|which|to|with|in|on|so)\b|[,.!?]|$)/,
    );
  const title = (m?.[1] ?? text.split(/[,.!?]/)[0])
    .trim()
    .split(/\s+/)
    .slice(0, 5)
    .join(' ');
  return title ? title.charAt(0).toUpperCase() + title.slice(1, 60) : 'My part';
}

function countPeople(lowerText: string): number {
  if (/two (people|adults|persons)|2 (people|adults)/.test(lowerText)) return 2;
  if (/three (people|adults)|3 (people|adults)/.test(lowerText)) return 3;
  if (/person|people|adult|someone|me\b|stand|sit|climb/.test(lowerText))
    return 1;
  return 0;
}

// What saving 1 kg is worth (USD) for the balanced goal: high for things that fly, lower for vehicles.
function massValuePerKg(lowerText: string): number {
  if (/\b(drone|uav|aircraft|plane)\b/.test(lowerText)) return 100;
  if (/\b(bike|bicycle|car|vehicle|racing)\b/.test(lowerText)) return 10;
  return 1;
}

const DEFAULT_TITLES: Record<PartKind, string> = {
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

export function mockExtract(
  text: string,
  audience: Audience,
): { spec: DesignSpecInput; questions: Question[] } {
  const lowerText = text.toLowerCase();
  const hasNumbers =
    LOAD_RE.test(text) || new RegExp(LENGTH_RE.source, 'i').test(text);
  LOAD_RE.lastIndex = 0;
  const kind = partKindOf(lowerText, hasNumbers);
  const assumptions: string[] = [];
  const questions: Question[] = [];

  const loads = [...text.matchAll(LOAD_RE)].map((m) => ({
    value: parseNumber(m[1]),
    unit: LOAD_UNIT_ALIASES[m[2].toLowerCase()] ?? m[2].toLowerCase(),
  }));
  const torques = [...text.matchAll(TORQUE_RE)].map((m) => ({
    value: parseNumber(m[1]),
    unit: /lb/i.test(m[2]) ? 'lbf·ft' : 'N·m',
  }));
  let load: { value: number; unit: string } | null =
    kind === 'shaft'
      ? (torques[0] ?? null)
      : (loads.sort((a, b) => b.value - a.value)[0] ?? null);
  const people = countPeople(lowerText);
  if (!load && people && kind !== 'coolbox') {
    load = { value: 100 * people, unit: 'kg' };
    assumptions.push(
      `Load of ${100 * people} kg: ${people === 1 ? 'one person' : `${people} people`} at about 100 kg each.`,
    );
  }

  const foundLengths = findLengths(text);
  const widthLength = foundLengths.find(isWidth);
  const deflectionLength = foundLengths.find(
    (l) => l !== widthLength && isDeflection(l),
  );
  const spanCandidates = foundLengths.filter(
    (l) => l !== widthLength && l !== deflectionLength,
  );
  const spanLength =
    spanCandidates.find((l) =>
      /^\s*(long|span|length|tall|high)\b/.test(l.after),
    ) ??
    spanCandidates.sort((a, b) => b.mm - a.mm)[0] ??
    null;

  const spec: DesignSpecInput = {
    title: kind === 'custom' ? guessTitle(text) : DEFAULT_TITLES[kind],
    audience,
    component: 'beam',
    objective: /cheap|budget|low cost|inexpensive|affordable/.test(lowerText)
      ? 'min_cost'
      : 'min_mass',
    criteria: ['stiffness', 'strength'],
    load,
    length: spanLength
      ? { value: spanLength.value, unit: spanLength.unit }
      : null,
    maxDeflection: deflectionLength
      ? { value: deflectionLength.value, unit: deflectionLength.unit }
      : null,
    environment: [],
    requiredProcesses: TOOL_WORDS.filter(([re]) => re.test(text)).map(
      ([, p]) => p,
    ),
    sourceText: text,
    assumptions,
  };
  const explicitLight = /\b(light|lightweight|weight|portable|carry)\b/.test(
    lowerText,
  );
  const wantsCheap = spec.objective === 'min_cost';
  const wantsGreen =
    /\b(eco|green|sustainable|low[- ]carbon|environment(al)?)\b/.test(
      lowerText,
    );
  // "weight" alone often means the load ("holds the weight of books"), so it doesn't count as a goal here.
  const wantsLight = /\b(light|lightweight|portable)\b/.test(lowerText);
  const goalsNamed = [wantsLight, wantsCheap, wantsGreen].filter(
    Boolean,
  ).length;
  if (
    goalsNamed >= 2 ||
    /\b(balance|balanced|trade[- ]?off)\b/.test(lowerText)
  ) {
    // Two or more goals named: use Ashby's penalty function, with exchange constants typical for the application.
    spec.objective = 'balanced';
    const alphaMass = massValuePerKg(lowerText);
    const alphaCo2 = wantsGreen ? 0.2 : 0.1;
    spec.penalty = {
      alphaMass,
      alphaCo2,
      rationale: `Typical values for this kind of product: $${alphaMass} per kg saved and $${alphaCo2 * 1000}/t CO₂e.`,
    };
    assumptions.push(
      `Goal is the best balance of cost, weight and carbon, valuing each kg saved at $${alphaMass} and carbon at $${alphaCo2 * 1000} per tonne.`,
    );
  } else if (wantsGreen) {
    spec.objective = 'min_carbon';
    assumptions.push(
      'Goal is the lowest carbon footprint, because you asked for an eco-friendly part.',
    );
  } else if (spec.objective === 'min_cost')
    assumptions.push(
      'Goal is the cheapest part, because you asked for low cost.',
    );
  else if (
    !explicitLight &&
    ['shelf', 'bench', 'leg', 'generic'].includes(kind)
  ) {
    // Static furniture stays in place, so weight rarely matters and cost is the sensible default goal.
    spec.objective = 'min_cost';
    assumptions.push(
      'Goal is the cheapest part: it stays in place, so its weight hardly matters.',
    );
  }

  const env = new Set<Environment>();
  if (
    /\b(outdoors?|outside|garden|balcony|patio|yard|weather|rain|all year)\b/.test(
      lowerText,
    )
  )
    env.add('outdoor');
  if (/\b(bathroom|shower|wet|pool|boat|lake|river)\b/.test(lowerText))
    env.add('wet');
  if (
    /\b(sea|seaside|seawater|marine|salt ?water|coast(al)?)\b/.test(lowerText)
  )
    env.add('marine');
  if (/\b(acids?|chemicals?|solvents?|lab|laboratory)\b/.test(lowerText))
    env.add('chemical');
  if (/\b(food|drinks?|kitchen|cook\w*|lunch|picnic)\b/.test(lowerText))
    env.add('food_contact');
  if (/\b(garage|shed)\b/.test(lowerText) && !env.size) env.add('outdoor');
  if (!env.size) {
    env.add('indoor');
    assumptions.push('Used indoors (no outdoor or wet use mentioned).');
  }
  spec.environment = [...env];
  if (env.has('outdoor') || env.has('marine')) {
    spec.tempRangeC = [-20, 50];
    assumptions.push('Outdoor temperatures from -20 °C to 50 °C.');
  }

  const spanMm = spanLength?.mm ?? null;
  const setDeflection = (ratio: number, why: string) => {
    if (!spec.maxDeflection && spanMm) {
      const mm = Math.round((spanMm / ratio) * 10) / 10;
      spec.maxDeflection = { value: mm, unit: 'mm' };
      assumptions.push(
        `Allowed bending ${formatNumber(mm)} mm (span/${ratio}, ${why}).`,
      );
    }
  };

  switch (kind) {
    case 'ladder':
      Object.assign(spec, {
        component: 'beam',
        support: 'simply_supported_center',
        section: 'square_tube',
        safetyClass: 'carries_people',
      });
      assumptions.push(
        'The critical part is a side rail, checked as a beam (ladder laid flat on its ends, person standing in the middle) — more severe than normal leaning use.',
      );
      if (spec.load) {
        const per = {
          value: Math.round((spec.load.value / 2) * 10) / 10,
          unit: spec.load.unit,
        };
        assumptions.push(
          `The two side rails share the load, so each rail carries ${formatNumber(per.value)} ${per.unit}.`,
        );
        spec.load = per;
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
      Object.assign(spec, {
        component: 'beam',
        support: 'simply_supported_uniform',
        section: 'rect_fixed_width',
        safetyClass: 'general',
      });
      if (widthLength)
        spec.sectionWidth = {
          value: widthLength.value,
          unit: widthLength.unit,
        };
      else {
        spec.sectionWidth = { value: 250, unit: 'mm' };
        assumptions.push('Board width (depth) of 250 mm.');
      }
      assumptions.push(
        'The shelf is a board supported at both ends with the load spread evenly.',
      );
      setDeflection(200, 'a common limit so shelves do not visibly sag');
      break;
    }
    case 'bench':
      Object.assign(spec, {
        component: 'beam',
        support: 'simply_supported_center',
        section: 'rect_fixed_width',
        safetyClass: 'carries_people',
      });
      if (widthLength)
        spec.sectionWidth = {
          value: widthLength.value,
          unit: widthLength.unit,
        };
      else {
        spec.sectionWidth = { value: 400, unit: 'mm' };
        assumptions.push('Seat width (depth) of 400 mm.');
      }
      assumptions.push(
        'The seat is a board supported at both ends; the worst case is the load at the middle.',
      );
      setDeflection(200, 'so the seat does not feel springy');
      break;
    case 'drone':
      Object.assign(spec, {
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
      Object.assign(spec, {
        component: 'insulation',
        criteria: ['stiffness', 'strength'],
        safetyClass: 'general',
        load: null,
        length: null,
      });
      spec.environment = [
        ...new Set<Environment>([
          ...(spec.environment as Environment[]),
          'food_contact',
        ]),
      ].filter((e) => e !== 'indoor');
      if (!spec.environment.length) spec.environment = ['food_contact'];
      spec.tempRangeC = [-20, 60];
      assumptions.push(
        'The critical part is the insulating wall: ranked by how little heat it lets through.',
      );
      assumptions.push(
        'Contents and lid see -20 °C (ice packs) to 60 °C (temperatures car).',
      );
      break;
    case 'leg':
      Object.assign(spec, {
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
      Object.assign(spec, {
        component: 'tie',
        section: 'solid_round',
        criteria: ['strength'],
        safetyClass: /lift|hoist|hang/.test(lowerText) ? 'lifting' : 'general',
      });
      assumptions.push('Sized for strength in tension only.');
      break;
    case 'shaft':
      Object.assign(spec, {
        component: 'shaft',
        section: 'solid_round',
        criteria: ['strength'],
      });
      assumptions.push('Sized for torsional strength of a solid round shaft.');
      break;
    case 'brake':
      Object.assign(spec, {
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
            reason: 'pad surfaces get this temperatures under hard braking',
          },
        ],
        customObjective: {
          description:
            'Longest life: least material worn away per unit of braking work',
          terms: [{ property: 'wear_rate', exponent: -1 }],
        },
      });
      if (spec.environment?.includes('indoor')) {
        spec.environment = ['outdoor'];
        spec.tempRangeC = [-20, 50];
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
      Object.assign(spec, {
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
          explicitLight || spec.objective !== 'min_cost'
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
      Object.assign(spec, {
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
      Object.assign(spec, {
        component: 'beam',
        support: 'simply_supported_center',
        section: 'solid_square',
      });
      assumptions.push(
        'Idealised as a beam supported at both ends with the load at the centre.',
      );
      setDeflection(250, 'a typical general-purpose limit');
  }

  // Extra requirements stated in plain words (this is also what "Anything else?" sends).
  const temperatures = [
    ...lowerText.matchAll(
      /(?:surviv\w*|withstand\w*|up to|reach\w*|handle\w*|at|to|hot as|temperatures? of)\s*(-?\d+(?:\.\d+)?)\s*°?\s*c\b/g,
    ),
  ].map((m) => Number(m[1]));
  if (temperatures.length) {
    const maxTemperature = Math.max(...temperatures);
    if (spec.component === 'custom') {
      const others = (spec.propertyLimits ?? []).filter(
        (l) => l.property !== 'tMax',
      );
      spec.propertyLimits = [
        ...others,
        {
          property: 'tMax',
          min: maxTemperature,
          max: null,
          reason: 'you said it must handle this temperature',
        },
      ];
    } else
      spec.tempRangeC = [
        Math.min(spec.tempRangeC?.[0] ?? 20, 20),
        Math.max(maxTemperature, spec.tempRangeC?.[1] ?? maxTemperature),
      ];
    assumptions.push(
      `Must keep working at ${formatNumber(maxTemperature)} °C.`,
    );
  }
  const money = lowerText.match(
    /(?:under|below|less than|max(?:imum)?|budget of|at most)\s*\$\s?(\d+(?:\.\d+)?)(\s*(?:\/|per)\s*kg)?/,
  );
  if (money) {
    if (money[2]) spec.maxPricePerKg = Number(money[1]);
    else spec.budgetPerPart = Number(money[1]);
    assumptions.push(
      money[2]
        ? `Material must cost at most $${money[1]} per kg.`
        : `Budget of $${money[1]} of material per part.`,
    );
  }
  const mustHave = new Set(spec.mustHave ?? []);
  if (/\b(transparent|see[- ]through|clear)\b/.test(lowerText))
    mustHave.add('transparent');
  if (
    /\b(electrical(ly)? insulat\w*|non[- ]conductive|doesn'?t conduct|not conduct)/.test(
      lowerText,
    )
  )
    mustHave.add('electrical_insulator');
  if (/\b(shatter\w*|impact|drop\w*|won'?t break when hit)\b/.test(lowerText))
    mustHave.add('impact_resistant');
  spec.mustHave = [...mustHave];

  if (/\b(lift\w*|hoist|crane|hook|sling)\b/.test(lowerText))
    spec.safetyClass = 'lifting';
  if (spec.safetyClass !== 'general' && kind !== 'brake')
    assumptions.push(
      'If it fails someone could get hurt, so a larger safety margin is used.',
    );
  if (kind === 'brake')
    assumptions.push(
      'Brakes are safety-critical: the result is guidance only.',
    );
  // Brittle materials are excluded for load-bearing parts that carry people or loads (they fail without warning).
  if (
    (spec.safetyClass === 'carries_people' || spec.safetyClass === 'lifting') &&
    STRUCTURAL_KINDS.includes(kind)
  ) {
    spec.mustHave = [
      ...new Set([...(spec.mustHave ?? []), 'impact_resistant' as const]),
    ];
    assumptions.push(
      'Brittle materials are excluded: they break suddenly, without bending first, which is dangerous for this use.',
    );
  }

  // Only ask what a structural part needs to be sized; everything else becomes an assumption.
  const sized = STRUCTURAL_KINDS.includes(kind);
  if (sized && !spec.load) {
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
  if (sized && !spec.length) {
    let suggested = { values: [0.6, 1, 1.5], unit: 'm' };
    if (kind === 'drone') suggested = { values: [15, 20, 30], unit: 'cm' };
    if (kind === 'ladder') suggested = { values: [2, 3, 4], unit: 'm' };
    const lengthOptions = suggested.values.map((value) => ({
      label: `${value} ${suggested.unit}`,
      value: { value, unit: suggested.unit },
    }));
    questions.push({
      field: 'length',
      question:
        kind === 'ladder'
          ? 'How long is the ladder?'
          : 'How long is it between supports?',
      options: lengthOptions,
      default: null,
    });
  }
  if (!spec.requiredProcesses?.length)
    assumptions.push(
      'No tool restrictions: assumed you will buy it ready-made or have it made.',
    );
  return { spec, questions: questions.slice(0, 2) };
}
