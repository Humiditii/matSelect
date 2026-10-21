import { AUDIENCES } from './types';
import type {
  Audience,
  Component,
  Confidence,
  EndCondition,
  Environment,
  Family,
  MustHave,
  Objective,
  Process,
  ProcessRating,
  SafetyClass,
  Section,
  Support,
} from './types';

export const AUDIENCE_LABEL: Record<Audience, { label: string; icon: string; hint: string }> = {
  craftsman: { label: 'Craftsman', icon: '🔨', hint: 'What to buy and how to work it' },
  everyday: { label: 'Everyday', icon: '💬', hint: 'Plain language, no jargon' },
  engineer: { label: 'Engineer', icon: '📐', hint: 'Method, indices and probabilities' },
};

export const COMPONENT_LABEL: Record<Component, { label: string; hint: string; icon: string }> = {
  beam: { label: 'Beam / board that bends', hint: 'Shelves, rails, planks, arms, seats', icon: '➖' },
  tie: { label: 'Rod or cable that is pulled', hint: 'Hangers, ropes, tension rods', icon: '↕️' },
  column: { label: 'Leg or post that is pushed', hint: 'Table legs, posts, struts', icon: '🏛️' },
  shaft: { label: 'Shaft that twists', hint: 'Axles, drive shafts', icon: '🔄' },
  spring: { label: 'Spring', hint: 'Stores energy and springs back', icon: '🌀' },
  hinge: { label: 'Flexible hinge / clip', hint: 'Bends a lot without breaking', icon: '📎' },
  insulation: { label: 'Insulation', hint: 'Keeps heat in or out', icon: '🧊' },
  thermal_shock: { label: 'Survives sudden heat/cold', hint: 'Cookware, kiln parts', icon: '🔥' },
  custom: { label: 'Chosen by its properties', hint: 'Brake pads, heat sinks, blades, seals…', icon: '🧪' },
};

export const PROPERTY_LABEL: Record<string, { label: string; unit: string }> = {
  density: { label: 'Density', unit: 'kg/m³' },
  E: { label: 'Stiffness (Young’s modulus)', unit: 'GPa' },
  G: { label: 'Shear modulus', unit: 'GPa' },
  strength: { label: 'Strength', unit: 'MPa' },
  Kic: { label: 'Toughness (K_IC)', unit: 'MPa·√m' },
  tMax: { label: 'Max service temperature', unit: '°C' },
  tMin: { label: 'Min service temperature', unit: '°C' },
  lambda: { label: 'Thermal conductivity', unit: 'W/m·K' },
  alpha: { label: 'Thermal expansion', unit: 'µstrain/K' },
  price: { label: 'Price', unit: 'USD/kg' },
  co2: { label: 'Carbon footprint', unit: 'kg CO₂e/kg' },
  embodiedEnergy: { label: 'Embodied energy', unit: 'MJ/kg' },
};

// Region codes that Intl knows but that are not countries.
const NOT_COUNTRIES = new Set([
  'EU', 'EZ', 'UN', 'QO', 'XA', 'XB', 'ZZ', 'AQ', 'BV', 'HM', 'TF', 'UM', 'IO', 'CP', 'DG', 'EA', 'IC', 'TA', 'AC', 'XK',
]);

export interface Country {
  code: string;
  name: string;
}

let countryCache: Country[] | null = null;

// Built from the browser's Intl data rather than a hard-coded list.
export function countries(): Country[] {
  if (countryCache) return countryCache;
  const list: Country[] = [];
  try {
    const regionNames = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' });
    for (let first = 65; first <= 90; first++) {
      for (let second = 65; second <= 90; second++) {
        const code = String.fromCharCode(first, second);
        const name = regionNames.of(code);
        // Retired codes map to a new one (DY is now BJ for Benin), so keep only codes that are already canonical.
        const canonical = Intl.getCanonicalLocales(`und-${code}`)[0]?.split('-')[1];
        if (name && name !== code && canonical === code && !NOT_COUNTRIES.has(code)) list.push({ code, name });
      }
    }
  } catch {
    // Very old browsers: the list stays empty.
  }
  countryCache = list.sort((a, b) => a.name.localeCompare(b.name));
  return countryCache;
}

/** Guesses the user's country from the browser locale, e.g. "en-NG" gives "NG". */
export function browserCountry(): string | null {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region;
    return region && /^[A-Z]{2}$/.test(region) ? region : null;
  } catch {
    return null;
  }
}

/** Label and unit of a standard or custom property. */
export function propertyInfo(spec: { customProperties?: { key: string; label: string; unit: string }[] }, key: string) {
  const custom = spec.customProperties?.find((property) => property.key === key);
  if (custom) return { label: custom.label, unit: custom.unit };
  return PROPERTY_LABEL[key] ?? { label: key, unit: '' };
}

export const SUPPORT_LABEL: Record<Support, string> = {
  simply_supported_center: 'Supported at both ends, load in the middle',
  simply_supported_uniform: 'Supported at both ends, load spread evenly',
  cantilever_end: 'Fixed at one end, load at the free end',
};

export const END_LABEL: Record<EndCondition, string> = {
  pinned_pinned: 'Both ends pinned (can rotate)',
  fixed_free: 'Fixed at the bottom, free at the top',
  fixed_fixed: 'Both ends fixed',
  fixed_pinned: 'One end fixed, the other pinned',
};

export const SECTION_LABEL: Record<Section, { label: string; icon: string }> = {
  solid_square: { label: 'Square bar', icon: '■' },
  solid_round: { label: 'Round bar', icon: '●' },
  square_tube: { label: 'Square tube', icon: '▢' },
  round_tube: { label: 'Round tube', icon: '◯' },
  rect_fixed_width: { label: 'Board / plank', icon: '▬' },
};

export const ENV_LABEL: Record<Environment, { label: string; icon: string }> = {
  indoor: { label: 'Indoors', icon: '🏠' },
  outdoor: { label: 'Outdoors', icon: '🌦️' },
  wet: { label: 'Wet', icon: '💧' },
  marine: { label: 'Sea water', icon: '🌊' },
  chemical: { label: 'Chemicals', icon: '🧪' },
  food_contact: { label: 'Touches food', icon: '🍎' },
};

export const PROCESS_LABEL: Record<Process, string> = {
  hand_cut: 'Hand saw',
  power_cut: 'Power saw / grinder',
  drill: 'Drill',
  machine: 'Lathe / mill',
  weld: 'Welder',
  glue: 'Glue',
  fasten: 'Screws / bolts',
  bend: 'Bending',
  cast: 'Casting',
  mould: 'Moulding',
  print_3d: '3D printer',
  woodwork: 'Woodworking tools',
};

export const MUST_HAVE_LABEL: Record<MustHave, string> = {
  transparent: 'See-through',
  electrical_insulator: 'Doesn’t conduct electricity',
  impact_resistant: 'Won’t shatter if hit',
  recyclable: 'Recyclable',
  renewable: 'From a renewable source',
};

export const FAMILY_LABEL: Record<Family, { label: string; icon: string; color: string }> = {
  metal: { label: 'Metal', icon: '⚙️', color: 'bg-slate-100 text-slate-700 ring-slate-300' },
  polymer: { label: 'Plastic', icon: '🧴', color: 'bg-sky-50 text-sky-700 ring-sky-200' },
  ceramic_glass: { label: 'Ceramic / glass', icon: '🏺', color: 'bg-violet-50 text-violet-700 ring-violet-200' },
  composite: { label: 'Composite', icon: '🧵', color: 'bg-indigo-50 text-indigo-700 ring-indigo-200' },
  wood_natural: { label: 'Wood / natural', icon: '🌳', color: 'bg-amber-50 text-amber-800 ring-amber-200' },
  foam_elastomer: { label: 'Foam / rubber', icon: '🧽', color: 'bg-rose-50 text-rose-700 ring-rose-200' },
};

export const SAFETY_LABEL: Record<SafetyClass, { label: string; hint: string }> = {
  general: { label: 'General use', hint: 'Nobody gets hurt if it fails' },
  carries_people: { label: 'Carries people', hint: 'Ladders, seats, platforms' },
  lifting: { label: 'Lifting loads', hint: 'Hooks, hoists, slings' },
};

// Shared by process ratings and recyclability, which use the same four levels.
export const RATING_LEVEL_STYLE: Record<ProcessRating, string> = {
  good: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  possible: 'bg-sky-50 text-sky-700 ring-sky-200',
  difficult: 'bg-amber-50 text-amber-800 ring-amber-200',
  no: 'bg-rose-50 text-rose-700 ring-rose-200',
};

export const CONFIDENCE_STYLE: Record<Confidence, string> = {
  high: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  medium: 'bg-amber-50 text-amber-800 ring-amber-200',
  low: 'bg-rose-50 text-rose-700 ring-rose-200',
};

export const RATING_STYLE: Record<string, string> = {
  A: 'bg-emerald-100 text-emerald-800',
  B: 'bg-lime-100 text-lime-800',
  C: 'bg-amber-100 text-amber-800',
  D: 'bg-orange-100 text-orange-800',
  E: 'bg-rose-100 text-rose-800',
};

export const AUDIENCE_OPTIONS = AUDIENCES.map((audience) => ({
  value: audience,
  label: `${AUDIENCE_LABEL[audience].icon} ${AUDIENCE_LABEL[audience].label}`,
  title: AUDIENCE_LABEL[audience].hint,
}));

export const GOAL_OPTIONS: { value: Objective; label: string }[] = [
  { value: 'min_mass', label: '🪶 As light as possible' },
  { value: 'min_cost', label: '💲 As cheap as possible' },
  { value: 'min_carbon', label: '🌱 Lowest carbon' },
  { value: 'balanced', label: '⚖️ Balanced' },
];

// For parts chosen by their properties, "light" and "cheap" mean best performance and best value.
export const CUSTOM_GOAL_OPTIONS: { value: Objective; label: string }[] = [
  { value: 'min_mass', label: '🏆 Best performance' },
  { value: 'min_cost', label: '💲 Best value for money' },
  { value: 'min_carbon', label: '🌱 Lowest carbon' },
  { value: 'balanced', label: '⚖️ Balanced' },
];

export const EXAMPLES: { label: string; icon: string; text: string }[] = [
  {
    label: 'Ladder',
    icon: '🪜',
    text: 'A 3 m leaning ladder for my house. It must hold a 120 kg person and live outdoors in the garage. I only have a hand saw and a drill.',
  },
  {
    label: 'Bookshelf',
    icon: '📚',
    text: 'A bookshelf board 90 cm long and 25 cm deep, holding about 30 kg of books, screwed to wall brackets at each end. I have woodworking tools and a drill.',
  },
  {
    label: 'Drone arm',
    icon: '🚁',
    text: 'Arms for a racing quadcopter, 20 cm long, each motor pushes up to 1.2 kg of thrust. As light as possible. I will buy the tube and only drill and glue it.',
  },
  {
    label: 'Garden bench',
    icon: '🪑',
    text: 'A garden bench seat 1.5 m long and 40 cm deep that two adults can sit on, left outside all year. Cheap materials please; I have a saw and a drill.',
  },
  {
    label: 'Brake pad',
    icon: '🛑',
    text: 'I want to design a brake pad for my motorbike.',
  },
  {
    label: 'Heat sink',
    icon: '♨️',
    text: 'A light heat sink for an LED lamp.',
  },
  {
    label: 'Cool box',
    icon: '🧊',
    text: 'A cool box to keep drinks and food cold for a day at the beach. It should be light to carry.',
  },
];

const SUPERSCRIPT_DIGITS: Record<string, string> = {
  '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
};

/** Rounds to `significantDigits` and writes very small numbers as 1.2×10⁻⁵. */
export function formatNumber(value: number, significantDigits = 3): string {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '0';
  if (Math.abs(value) < 1e-3) {
    const [mantissa, exponent] = value.toExponential(Math.max(0, significantDigits - 2)).split('e');
    const superscript = String(Number(exponent)).replace(/./g, (char) => SUPERSCRIPT_DIGITS[char] ?? char);
    return `${Number(mantissa)}×10${superscript}`;
  }
  const rounded = Number(value.toPrecision(significantDigits));
  return Math.abs(rounded) >= 10000 ? Math.round(rounded).toLocaleString('en-US') : String(rounded);
}

export function formatUsd(value: number): string {
  if (value >= 100) return `$${Math.round(value).toLocaleString('en-US')}`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toPrecision(2)}`;
}

export function formatRange(range: [number, number] | null, significantDigits = 3): string {
  if (!range) return '—';
  const [low, high] = range;
  if (low === high) return formatNumber(low, significantDigits);
  return `${formatNumber(low, significantDigits)}–${formatNumber(high, significantDigits)}`;
}

export const formatPercent = (fraction: number) => `${Math.round(fraction * 100)}%`;

export const materialName = (material: { name: string; grade: string | null }) =>
  material.grade ? `${material.name} (${material.grade})` : material.name;
