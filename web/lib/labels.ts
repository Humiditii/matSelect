import type {
  Audience,
  Component,
  Confidence,
  EndCondition,
  Environment,
  Family,
  MustHave,
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

export const RECYCLABILITY_STYLE: Record<string, string> = {
  good: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  possible: 'bg-sky-50 text-sky-700 ring-sky-200',
  difficult: 'bg-amber-50 text-amber-800 ring-amber-200',
  no: 'bg-rose-50 text-rose-700 ring-rose-200',
};

const NOT_COUNTRIES = new Set(['EU', 'EZ', 'UN', 'QO', 'XA', 'XB', 'ZZ', 'AQ', 'BV', 'HM', 'TF', 'UM', 'IO', 'CP', 'DG', 'EA', 'IC', 'TA', 'AC', 'XK']);
let countryCache: { code: string; name: string }[] | null = null;

/** Every country the browser knows, sorted by name (built from Intl, no hard-coded list). */
export function countries(): { code: string; name: string }[] {
  if (countryCache) return countryCache;
  const out: { code: string; name: string }[] = [];
  try {
    const dn = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' });
    for (let a = 65; a <= 90; a++)
      for (let b = 65; b <= 90; b++) {
        const code = String.fromCharCode(a, b);
        const name = dn.of(code);
        // Skip retired codes (e.g. DY → BJ for Benin): keep only codes that are their own canonical form.
        const canonical = Intl.getCanonicalLocales(`und-${code}`)[0]?.split('-')[1];
        if (name && name !== code && canonical === code && !NOT_COUNTRIES.has(code)) out.push({ code, name });
      }
  } catch {
    /* very old browsers: empty list, the select still works with typed codes */
  }
  countryCache = out.sort((x, y) => x.name.localeCompare(y.name));
  return countryCache;
}

export const countryNameOf = (code: string | null | undefined) =>
  (code && countries().find((c) => c.code === code)?.name) || code || '';

/** Best guess of the user's country from the browser locale (e.g. "en-NG" → "NG"). */
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
  const c = spec.customProperties?.find((p) => p.key === key);
  return c ? { label: c.label, unit: c.unit } : PROPERTY_LABEL[key] ?? { label: key, unit: '' };
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

export const PROCESS_RATING_STYLE: Record<ProcessRating, string> = {
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

const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
export const fmt = (x: number, sig = 3) => {
  if (!Number.isFinite(x)) return '—';
  if (x === 0) return '0';
  if (Math.abs(x) < 1e-3) {
    const [m, e] = x.toExponential(Math.max(0, sig - 2)).split('e');
    return `${Number(m)}×10${String(Number(e)).replace(/./g, (c) => SUP[c] ?? c)}`;
  }
  const r = Number(x.toPrecision(sig));
  return Math.abs(r) >= 10000 ? Math.round(r).toLocaleString('en-US') : String(r);
};
export const fmtUsd = (x: number) => (x >= 100 ? `$${Math.round(x).toLocaleString('en-US')}` : x >= 1 ? `$${x.toFixed(2)}` : `$${x.toPrecision(2)}`);
export const fmtRange = (r: [number, number] | null, sig = 3) => (r ? (r[0] === r[1] ? fmt(r[0], sig) : `${fmt(r[0], sig)}–${fmt(r[1], sig)}`) : '—');
export const pct = (p: number) => `${Math.round(p * 100)}%`;
export const materialName = (m: { name: string; grade: string | null }) => (m.grade ? `${m.name} (${m.grade})` : m.name);
