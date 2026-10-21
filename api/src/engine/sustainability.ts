/**
 * Sustainability and processability, decided in code from the material data.
 *
 * - Critical raw materials are matched against the official EU list rather than taken from the AI's
 *   judgement: the data source only says which elements a material contains.
 * - Processability is derived from the per-process workshop ratings the material already carries.
 */
import {
  Material,
  PROCESSES,
  Process,
  ProcessabilityI,
  Range,
  SustainabilityI,
} from 'src/common/domain/domain.types';

/**
 * EU Critical Raw Materials Act — Regulation (EU) 2024/1252, Annex II (34 critical raw materials).
 * Each entry: the list's own name, then the names/symbols a data source might use for it.
 */
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

export const CRM_SOURCE =
  'EU Critical Raw Materials Act, Regulation (EU) 2024/1252, Annex II';

const ALIASES = new Map<string, string>();
for (const [name, aliases] of EU_CRITICAL_RAW_MATERIALS)
  for (const a of aliases) ALIASES.set(a, name);

/** Map the elements a material contains to EU critical raw material names (unknown names are ignored). */
export function matchCriticalRawMaterials(elements: string[]): string[] {
  const out = new Set<string>();
  for (const e of elements) {
    const key = e
      .trim()
      .toLowerCase()
      .replace(/\s*\(.*\)$/, '');
    const hit = ALIASES.get(key);
    if (hit) out.add(hit);
  }
  return [...out].sort();
}

export function sustainabilityOf(m: Material): SustainabilityI {
  return {
    recyclability: m.recyclability ?? null,
    renewable: m.renewable ?? null,
    biodegradable: m.biodegradable ?? null,
    criticalRawMaterials: matchCriticalRawMaterials(m.criticalElements ?? []),
    hazards: m.hazards ?? [],
  };
}

/** Everyday shop processes used to judge how easy a material is to make things from. */
const WORKSHOP: Process[] = [
  'hand_cut',
  'power_cut',
  'drill',
  'machine',
  'glue',
  'fasten',
];
const RATING_SCORE = { good: 2, possible: 1, difficult: 0, no: 0 } as const;

/**
 * Easy / moderate / hard, from the six everyday workshop processes:
 * score = 2 per "good", 1 per "possible" (max 12). ≥ 9 easy, ≥ 5 moderate, else hard.
 */
export function processabilityOf(m: Material): ProcessabilityI {
  const rated = WORKSHOP.filter((p) => m.processes?.[p]);
  const best = PROCESSES.filter((p) => m.processes?.[p] === 'good');
  if (rated.length < 3)
    return { level: null, best, tips: m.processingTips ?? [] };
  const score = WORKSHOP.reduce(
    (s, p) => s + (m.processes?.[p] ? RATING_SCORE[m.processes[p]!] : 0),
    0,
  );
  const level = score >= 9 ? 'easy' : score >= 5 ? 'moderate' : 'hard';
  return { level, best, tips: m.processingTips ?? [] };
}

/** Footprint range for a quantity of material: per-kg range × mass (or mass range). */
export function scaleRange(perKg: Range | null, massKg: number): Range | null {
  return perKg ? [perKg[0] * massKg, perKg[1] * massKg] : null;
}
