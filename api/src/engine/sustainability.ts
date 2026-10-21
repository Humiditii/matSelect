// Sustainability and processability, decided in code from the material data.
// Critical raw materials are matched against the official EU list rather than
// left to the AI: the data source only says which elements a material contains.
// Processability comes from the material's per-process workshop ratings.
import {
  Material,
  PROCESSES,
  Process,
  ProcessabilityI,
  Range,
  SustainabilityI,
} from 'src/common/domain/domain.types';

// EU Critical Raw Materials Act, Regulation (EU) 2024/1252, Annex II (34 critical
// raw materials). Each entry is the list's own name, then the names and symbols
// a data source might use for it.
export const EU_CRITICAL_RAW_MATERIALS: [string, string[]][] = [
  ['aluminium/bauxite', ['aluminium', 'aluminum', 'al', 'bauxite', 'alumina']],
  ['antimony', ['antimony', 'sb']],
  ['arsenic', ['arsenic', 'as']],
  ['baryte', ['baryte', 'barite', 'barium sulfate', 'barium sulphate']],
  ['beryllium', ['beryllium', 'be']],
  ['bismuth', ['bismuth', 'bi']],
  ['boron', ['boron', 'b', 'borate', 'borates']],
  ['cobalt', ['cobalt', 'co']],
  ['coking coal', ['coking coal']],
  ['copper', ['copper', 'cu']],
  ['feldspar', ['feldspar']],
  ['fluorspar', ['fluorspar', 'fluorite']],
  ['gallium', ['gallium', 'ga']],
  ['germanium', ['germanium', 'ge']],
  ['hafnium', ['hafnium', 'hf']],
  ['helium', ['helium', 'he']],
  [
    'heavy rare earth elements',
    [
      'dysprosium',
      'dy',
      'terbium',
      'tb',
      'erbium',
      'er',
      'gadolinium',
      'gd',
      'yttrium',
      'y',
      'holmium',
      'lutetium',
      'ytterbium',
      'thulium',
      'europium',
      'eu',
      'heavy rare earth elements',
    ],
  ],
  [
    'light rare earth elements',
    [
      'neodymium',
      'nd',
      'praseodymium',
      'pr',
      'lanthanum',
      'la',
      'cerium',
      'ce',
      'samarium',
      'sm',
      'light rare earth elements',
      'rare earth',
      'rare earths',
    ],
  ],
  ['lithium', ['lithium', 'li']],
  ['magnesium', ['magnesium', 'mg']],
  ['manganese', ['manganese', 'mn']],
  ['natural graphite', ['natural graphite', 'graphite']],
  ['nickel', ['nickel', 'ni']],
  ['niobium', ['niobium', 'nb']],
  ['phosphate rock', ['phosphate rock', 'phosphate']],
  ['phosphorus', ['phosphorus', 'p']],
  [
    'platinum group metals',
    [
      'platinum',
      'pt',
      'palladium',
      'pd',
      'rhodium',
      'rh',
      'iridium',
      'ir',
      'ruthenium',
      'ru',
      'osmium',
      'os',
      'platinum group metals',
      'pgm',
      'pgms',
    ],
  ],
  ['scandium', ['scandium', 'sc']],
  ['silicon metal', ['silicon metal', 'silicon', 'si']],
  ['strontium', ['strontium', 'sr']],
  ['tantalum', ['tantalum', 'ta']],
  ['titanium metal', ['titanium', 'ti', 'titanium metal']],
  ['tungsten', ['tungsten', 'w', 'wolfram']],
  ['vanadium', ['vanadium', 'v']],
];

const CRM_BY_ALIAS = new Map<string, string>();
for (const [name, aliases] of EU_CRITICAL_RAW_MATERIALS)
  for (const alias of aliases) CRM_BY_ALIAS.set(alias, name);

/** Map the elements a material contains to EU critical raw material names (unknown names are ignored). */
export function matchCriticalRawMaterials(elements: string[]): string[] {
  const found = new Set<string>();
  for (const element of elements) {
    // "Cobalt (binder)" is matched as "cobalt".
    const key = element
      .trim()
      .toLowerCase()
      .replace(/\s*\(.*\)$/, '');
    const name = CRM_BY_ALIAS.get(key);
    if (name) found.add(name);
  }
  return [...found].sort();
}

export function sustainabilityOf(material: Material): SustainabilityI {
  return {
    recyclability: material.recyclability ?? null,
    renewable: material.renewable ?? null,
    biodegradable: material.biodegradable ?? null,
    criticalRawMaterials: matchCriticalRawMaterials(
      material.criticalElements ?? [],
    ),
    hazards: material.hazards ?? [],
  };
}

/** Everyday workshop processes, used to judge how easy a material is to work. */
const WORKSHOP_PROCESSES: Process[] = [
  'hand_cut',
  'power_cut',
  'drill',
  'machine',
  'glue',
  'fasten',
];
const RATING_SCORE = { good: 2, possible: 1, difficult: 0, no: 0 } as const;

// Scores 2 per "good" and 1 per "possible" over the six workshop processes
// (12 at most): 9 or more is easy, 5 or more moderate, anything less hard.
// At least three processes must be rated to give a level.
export function processabilityOf(material: Material): ProcessabilityI {
  const processes = material.processes ?? {};
  const best = PROCESSES.filter((p) => processes[p] === 'good');
  const tips = material.processingTips ?? [];
  const rated = WORKSHOP_PROCESSES.filter((p) => processes[p]);
  if (rated.length < 3) return { level: null, best, tips };

  let score = 0;
  for (const process of rated) score += RATING_SCORE[processes[process]!];
  let level: 'easy' | 'moderate' | 'hard' = 'hard';
  if (score >= 9) level = 'easy';
  else if (score >= 5) level = 'moderate';
  return { level, best, tips };
}

/** Scales a per-kg range by a mass. */
export function scaleRange(perKg: Range | null, massKg: number): Range | null {
  return perKg ? [perKg[0] * massKg, perKg[1] * massKg] : null;
}
