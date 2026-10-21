// Small, self-contained copies of the engine's formulas for the interactive
// demos on the "How it works" page. The values come from the built-in demo
// materials (api/src/core/llm/mock), and the maths follows api/src/engine:
// conservative low-end stiffness and strength, typical (geometric mean)
// density, price and carbon.

export type Range = [number, number];
export type Rating = 'A' | 'B' | 'C' | 'D' | 'E';
export type ProcessRating = 'good' | 'possible' | 'difficult' | 'no';

export interface DemoMaterial {
  id: string;
  name: string;
  /** GPa */
  E: Range;
  /** MPa */
  strength: Range;
  /** kg/m³ */
  density: Range;
  /** USD/kg */
  price: Range;
  /** kg CO₂e per kg */
  co2: Range;
  /** °C */
  tMax: Range;
  ratings: { freshWater: Rating; saltWater: Rating; uv: Rating; chemicals: Rating };
  brittle: boolean;
  recyclability: 'good' | 'difficult';
  handCut: ProcessRating;
  drill: ProcessRating;
  /** Wood and glass aren't sold as thin-walled tube, so they are sized as a solid bar. */
  soldAsTube: boolean;
}

export const DEMO_MATERIALS: DemoMaterial[] = [
  {
    id: 'steel',
    name: 'Mild steel',
    E: [200, 215],
    strength: [235, 300],
    density: [7800, 7900],
    price: [0.7, 1.1],
    co2: [1.6, 2.4],
    tMax: [350, 400],
    ratings: { freshWater: 'D', saltWater: 'E', uv: 'A', chemicals: 'C' },
    brittle: false,
    recyclability: 'good',
    handCut: 'possible',
    drill: 'good',
    soldAsTube: true,
  },
  {
    id: 'aluminium',
    name: 'Aluminium 6061-T6',
    E: [68, 71],
    strength: [240, 280],
    density: [2690, 2720],
    price: [2.5, 4],
    co2: [8, 16],
    tMax: [130, 170],
    ratings: { freshWater: 'A', saltWater: 'B', uv: 'A', chemicals: 'B' },
    brittle: false,
    recyclability: 'good',
    handCut: 'good',
    drill: 'good',
    soldAsTube: true,
  },
  {
    id: 'pine',
    name: 'Pine (C24)',
    E: [7.4, 12],
    strength: [24, 50],
    density: [450, 550],
    price: [0.6, 1.2],
    co2: [0.3, 0.5],
    tMax: [80, 100],
    ratings: { freshWater: 'D', saltWater: 'D', uv: 'C', chemicals: 'C' },
    brittle: false,
    recyclability: 'good',
    handCut: 'good',
    drill: 'good',
    soldAsTube: false,
  },
  {
    id: 'fir',
    name: 'Douglas fir',
    E: [10, 14],
    strength: [30, 80],
    density: [500, 580],
    price: [1, 2],
    co2: [0.3, 0.5],
    tMax: [80, 100],
    ratings: { freshWater: 'C', saltWater: 'D', uv: 'C', chemicals: 'C' },
    brittle: false,
    recyclability: 'good',
    handCut: 'good',
    drill: 'good',
    soldAsTube: false,
  },
  {
    id: 'gfrp',
    name: 'Glass fibre (GFRP)',
    E: [23, 30],
    strength: [200, 400],
    density: [1800, 2000],
    price: [5, 10],
    co2: [5, 9],
    tMax: [80, 120],
    ratings: { freshWater: 'A', saltWater: 'A', uv: 'B', chemicals: 'A' },
    brittle: false,
    recyclability: 'difficult',
    handCut: 'possible',
    drill: 'good',
    soldAsTube: true,
  },
  {
    id: 'cfrp',
    name: 'Carbon fibre (CFRP)',
    E: [110, 140],
    strength: [1200, 1800],
    density: [1500, 1600],
    price: [25, 50],
    co2: [30, 55],
    tMax: [120, 150],
    ratings: { freshWater: 'A', saltWater: 'A', uv: 'C', chemicals: 'B' },
    brittle: false,
    recyclability: 'difficult',
    handCut: 'difficult',
    drill: 'possible',
    soldAsTube: true,
  },
  {
    id: 'glass',
    name: 'Window glass',
    E: [68, 72],
    strength: [30, 50],
    density: [2440, 2520],
    price: [1, 1.5],
    co2: [0.8, 1.3],
    tMax: [400, 460],
    ratings: { freshWater: 'A', saltWater: 'A', uv: 'A', chemicals: 'A' },
    brittle: true,
    recyclability: 'good',
    handCut: 'difficult',
    drill: 'difficult',
    soldAsTube: false,
  },
];

/** The structural materials (glass is only used in the screening demo). */
export const STRUCTURAL = DEMO_MATERIALS.filter((m) => m.id !== 'glass');

export const typical = ([low, high]: Range) => Math.sqrt(low * high);

// Sections

export type Shape = 'solid_square' | 'round_tube' | 'plank';

export interface Geometry {
  /** A = cA·s^pA, I = cI·s^pI, Z = cZ·s^pZ, with s the size that is free to change. */
  cA: number;
  pA: number;
  cI: number;
  pI: number;
  cZ: number;
  pZ: number;
}

const TUBE_RATIO = 15; // outer diameter ÷ wall thickness
const PLANK_WIDTH = 0.2; // m

export function geometry(shape: Shape): Geometry {
  if (shape === 'solid_square') return { cA: 1, pA: 2, cI: 1 / 12, pI: 4, cZ: 1 / 6, pZ: 3 };
  if (shape === 'plank')
    return { cA: PLANK_WIDTH, pA: 1, cI: PLANK_WIDTH / 12, pI: 3, cZ: PLANK_WIDTH / 6, pZ: 2 };
  const inner = 1 - 2 / TUBE_RATIO;
  const hollow = 1 - inner ** 4;
  return { cA: (Math.PI / 4) * (1 - inner * inner), pA: 2, cI: (Math.PI / 64) * hollow, pI: 4, cZ: (Math.PI / 32) * hollow, pZ: 3 };
}

const SOLID_ROUND: Geometry = { cA: Math.PI / 4, pA: 2, cI: Math.PI / 64, pI: 4, cZ: Math.PI / 32, pZ: 3 };

export const SHAPE_LABEL: Record<Shape, string> = {
  solid_square: 'Solid square bar',
  round_tube: 'Round tube',
  plank: 'Plank (200 mm wide)',
};

// Sizing a beam

export type Support = 'cantilever' | 'simply_supported';

/** δ = F·L³ / (C·E·I) and M = k·F·L for a point load. */
export const SUPPORT = {
  cantilever: { C: 3, k: 1, label: 'Cantilever (fixed at one end, load at the tip)' },
  simply_supported: { C: 48, k: 1 / 4, label: 'Supported at both ends, load in the middle' },
} as const;

export interface BeamCase {
  loadN: number;
  spanM: number;
  maxDeflectionM: number;
  support: Support;
  shape: Shape;
  safetyFactor: number;
}

export interface BeamResult {
  material: DemoMaterial;
  /** The geometry actually used (wood and glass fall back to a solid bar). */
  usedSolid: boolean;
  sizeForStiffness: number;
  sizeForStrength: number;
  size: number;
  governing: 'stiffness' | 'strength';
  requiredI: number;
  areaM2: number;
  massKg: number;
  costUsd: number;
  co2Kg: number;
}

export interface MaterialValues {
  /** Pa */
  E: number;
  /** Pa */
  strength: number;
  density: number;
  price: number;
  co2: number;
}

/** Conservative values, as the engine uses them: weak end of E and strength, typical density, price and CO₂. */
export function conservativeValues(m: DemoMaterial): MaterialValues {
  return { E: m.E[0] * 1e9, strength: m.strength[0] * 1e6, density: typical(m.density), price: typical(m.price), co2: typical(m.co2) };
}

export function sizeBeam(m: DemoMaterial, beam: BeamCase, values = conservativeValues(m)): BeamResult {
  const usedSolid = beam.shape === 'round_tube' && !m.soldAsTube;
  const g = usedSolid ? SOLID_ROUND : geometry(beam.shape);
  const { C, k } = SUPPORT[beam.support];
  const F = beam.loadN;
  const L = beam.spanM;

  // Stiffness: the deflection must stay under the limit.
  const requiredI = (F * L ** 3) / (C * values.E * beam.maxDeflectionM);
  const sizeForStiffness = (requiredI / g.cI) ** (1 / g.pI);
  // Strength: the bending stress M/Z must stay under strength ÷ safety factor.
  const requiredZ = (k * F * L * beam.safetyFactor) / values.strength;
  const sizeForStrength = (requiredZ / g.cZ) ** (1 / g.pZ);

  const size = Math.max(sizeForStiffness, sizeForStrength);
  const areaM2 = g.cA * size ** g.pA;
  const massKg = values.density * areaM2 * L;
  return {
    material: m,
    usedSolid,
    sizeForStiffness,
    sizeForStrength,
    size,
    governing: sizeForStiffness >= sizeForStrength ? 'stiffness' : 'strength',
    requiredI,
    areaM2,
    massKg,
    costUsd: massKg * values.price,
    co2Kg: massKg * values.co2,
  };
}

// Random numbers (the same generator and sampling as the engine)

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Log-uniform draw inside a positive range. */
export const sampleLogUniform = (rng: () => number, [low, high]: Range) =>
  Math.exp(Math.log(low) + rng() * (Math.log(high) - Math.log(low)));

// Formatting

export function formatNumber(x: number, digits = 3): string {
  if (!Number.isFinite(x)) return '—';
  if (x === 0) return '0';
  const abs = Math.abs(x);
  if (abs < 1e-3) {
    // Very small numbers (like I in m⁴) read better as 6.13 × 10⁻⁸ than 6.13e-8.
    const [mantissa, power] = x.toExponential(digits - 1).split('e');
    const superscript: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
    return `${Number(mantissa)} × 10${String(Number(power)).replace(/./g, (c) => superscript[c] ?? c)}`;
  }
  if (abs >= 1000) return Math.round(x).toLocaleString('en-US');
  return Number(x.toPrecision(digits)).toString();
}

export const formatUsd = (x: number) => (x >= 100 ? `$${Math.round(x).toLocaleString('en-US')}` : x >= 1 ? `$${x.toFixed(2)}` : `$${x.toPrecision(2)}`);

export const formatMm = (metres: number) => formatNumber(metres * 1000);
