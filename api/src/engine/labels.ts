import {
  Environment,
  Family,
  MustHave,
  Process,
  Section,
} from 'src/common/domain/domain.types';

export const FAMILY_LABEL: Record<Family, string> = {
  metal: 'Metals',
  polymer: 'Polymers (plastics)',
  ceramic_glass: 'Ceramics & glass',
  composite: 'Composites',
  wood_natural: 'Wood & natural materials',
  foam_elastomer: 'Foams & elastomers',
};

export const PROCESS_LABEL: Record<Process, string> = {
  hand_cut: 'hand cutting',
  power_cut: 'power cutting',
  drill: 'drilling',
  machine: 'machining',
  weld: 'welding',
  glue: 'gluing',
  fasten: 'screws/bolts',
  bend: 'bending',
  cast: 'casting',
  mould: 'moulding',
  print_3d: '3D printing',
  woodwork: 'woodworking tools',
};

export const ENV_LABEL: Record<Environment, string> = {
  indoor: 'indoors',
  outdoor: 'outdoors',
  wet: 'wet conditions',
  marine: 'sea water / marine',
  chemical: 'chemicals',
  food_contact: 'food contact',
};

export const MUST_HAVE_LABEL: Record<MustHave, string> = {
  transparent: 'transparent',
  electrical_insulator: 'electrically insulating',
  impact_resistant: 'impact resistant',
  recyclable: 'recyclable',
  renewable: 'from a renewable source',
};

export const SECTION_LABEL: Record<Section, string> = {
  solid_square: 'solid square bar',
  solid_round: 'solid round bar',
  round_tube: 'round tube',
  square_tube: 'square tube',
  rect_fixed_width: 'board / plank of fixed width',
};

export const RATING_FIELD_LABEL = {
  fresh_water: 'fresh water',
  salt_water: 'salt water',
  uv: 'UV / sunlight',
  chemicals: 'chemicals',
} as const;

const SUP: Record<string, string> = {
  '-': '⁻',
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
};

/** Rounded number for prose: 3 significant figures, thousands separators for big numbers, ×10ⁿ for tiny ones. */
export function fmt(x: number, sig = 3): string {
  if (!Number.isFinite(x)) return String(x);
  if (x === 0) return '0';
  if (Math.abs(x) < 1e-3) {
    const [m, e] = x.toExponential(Math.max(0, sig - 2)).split('e');
    return `${Number(m)}×10${String(Number(e)).replace(/./g, (c) => SUP[c] ?? c)}`;
  }
  const r = Number(x.toPrecision(sig));
  if (Math.abs(r) >= 10000) return Math.round(r).toLocaleString('en-US');
  return String(r);
}

export function fmtUsd(x: number): string {
  if (x >= 100) return `$${Math.round(x).toLocaleString('en-US')}`;
  if (x >= 1) return `$${x.toFixed(2)}`;
  return `$${x.toPrecision(2)}`;
}

export const pct = (p: number) => `${Math.round(p * 100)}%`;

export const fmtRange = (r: [number, number]) =>
  r[0] === r[1] ? fmt(r[0]) : `${fmt(r[0])}–${fmt(r[1])}`;
