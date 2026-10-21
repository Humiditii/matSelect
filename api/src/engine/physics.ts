/**
 * Pure engineering physics: section scaling, material indices and part sizing.
 * everything here is SI (N, m, Pa, kg)
 */
import {
  Component,
  Criterion,
  EndCondition,
  Family,
  Objective,
  Section,
  Support,
} from 'src/common/domain/domain.types';

// ---------------------------------------------------------------------------
// Section geometry
// ---------------------------------------------------------------------------
/**
 * Every section property scales as c·s^p with the characteristic size s
 * (side, outer diameter or plank thickness). Tubes keep outer/wall = tubeRatio fixed,
 * so they scale like solids; a plank keeps its width fixed, so A ∝ s, I ∝ s³, Z ∝ s².
 */
export interface SectionGeometry {
  section: Section;
  /** Area A = cA·s^pA, second moment I = cI·s^pI, elastic modulus Z = cZ·s^pZ. */
  cA: number;
  pA: number;
  cI: number;
  pI: number;
  cZ: number;
  pZ: number;
  /** Polar moment J = cJ·s^4 and polar modulus Zp = cZp·s^3 (round sections only). */
  cJ: number | null;
  cZp: number | null;
  widthM: number | null;
  tubeRatio: number | null;
}

export function sectionGeometry(
  section: Section,
  tubeRatio = 15,
  widthM: number | null = null,
): SectionGeometry {
  const base = {
    section,
    cJ: null,
    cZp: null,
    widthM: null,
    tubeRatio: null,
  } as const;
  switch (section) {
    case 'solid_square':
      return { ...base, cA: 1, pA: 2, cI: 1 / 12, pI: 4, cZ: 1 / 6, pZ: 3 };
    case 'solid_round':
      return {
        ...base,
        cA: Math.PI / 4,
        pA: 2,
        cI: Math.PI / 64,
        pI: 4,
        cZ: Math.PI / 32,
        pZ: 3,
        cJ: Math.PI / 32,
        cZp: Math.PI / 16,
      };
    case 'round_tube': {
      const k = 1 - 2 / tubeRatio; // inner/outer diameter
      const k4 = 1 - k ** 4;
      return {
        ...base,
        tubeRatio,
        cA: (Math.PI / 4) * (1 - k * k),
        pA: 2,
        cI: (Math.PI / 64) * k4,
        pI: 4,
        cZ: (Math.PI / 32) * k4,
        pZ: 3,
        cJ: (Math.PI / 32) * k4,
        cZp: (Math.PI / 16) * k4,
      };
    }
    case 'square_tube': {
      const k = 1 - 2 / tubeRatio;
      const k4 = 1 - k ** 4;
      return {
        ...base,
        tubeRatio,
        cA: 1 - k * k,
        pA: 2,
        cI: k4 / 12,
        pI: 4,
        cZ: k4 / 6,
        pZ: 3,
      };
    }
    case 'rect_fixed_width': {
      if (!widthM || widthM <= 0)
        throw new Error('rect_fixed_width needs a positive width');
      return {
        ...base,
        widthM,
        cA: widthM,
        pA: 1,
        cI: widthM / 12,
        pI: 3,
        cZ: widthM / 6,
        pZ: 2,
      };
    }
  }
}

/** Solve c·s^p ≥ required for the smallest s. */
export const solveSize = (required: number, c: number, p: number) =>
  (required / c) ** (1 / p);

export const area = (g: SectionGeometry, s: number) => g.cA * s ** g.pA;

/** Families that are not sold or made as thin-walled tube: sized as the solid equivalent. */
export const NO_TUBE_FAMILIES: Family[] = [
  'wood_natural',
  'ceramic_glass',
  'foam_elastomer',
];

export function solidEquivalent(section: Section): Section {
  if (section === 'round_tube') return 'solid_round';
  if (section === 'square_tube') return 'solid_square';
  return section;
}

// ---------------------------------------------------------------------------
// Material indices
// ---------------------------------------------------------------------------
/** A property usable in an index: a standard property key or a custom property key (e.g. "friction_coefficient"). */
export type IndexProp = string;

/** Index = Π prop^exponent. Higher is better. */
export type IndexTerms = Partial<Record<IndexProp, number>>;

export interface IndexDef {
  criterion: Criterion | 'single';
  terms: IndexTerms;
  expression: string;
  description: string;
}

const SYMBOL: Record<string, string> = {
  E: 'E',
  G: 'G',
  strength: 'σ',
  density: 'ρ',
  price: 'C',
  lambda: 'λ',
  alpha: 'α',
  Kic: 'K_IC',
  tMax: 'T_max',
  tMin: 'T_min',
};
const TERM_ORDER: IndexProp[] = [
  'strength',
  'E',
  'G',
  'Kic',
  'lambda',
  'alpha',
  'tMax',
  'tMin',
  'density',
  'price',
];

/** Best small rational approximation (denominator ≤ 12) for display. */
export function toFraction(x: number): [number, number] {
  let best: [number, number] = [Math.round(x), 1];
  let err = Math.abs(x - best[0]);
  for (let d = 2; d <= 12; d++) {
    const n = Math.round(x * d);
    const e = Math.abs(x - n / d);
    if (e < err - 1e-12) {
      best = [n, d];
      err = e;
    }
  }
  return best;
}

function powerString(symbol: string, exp: number): string {
  const [n, d] = toFraction(exp);
  if (d === 1) return n === 1 ? symbol : `${symbol}^${n}`;
  return `${symbol}^(${n}/${d})`;
}

/**
 * Render an index in the conventional Ashby form, e.g. "E^(1/2)/ρ", "E/ρ·C", "σ^2/E·ρ", "1/λ".
 * Denominator factors are written as an unbracketed product (Ashby's "E/ρC" convention).
 * Custom properties use the symbols given in `symbols` (e.g. { friction_coefficient: "μ" }).
 */
export function formatIndex(
  terms: IndexTerms,
  symbols: Record<string, string> = {},
): string {
  const num: string[] = [];
  const den: string[] = [];
  const keys = [
    ...TERM_ORDER.filter((k) => terms[k]),
    ...Object.keys(terms)
      .filter((k) => !TERM_ORDER.includes(k))
      .sort(),
  ];
  for (const p of keys) {
    const e = terms[p];
    if (!e) continue;
    (e > 0 ? num : den).push(
      powerString(symbols[p] ?? SYMBOL[p] ?? p, Math.abs(e)),
    );
  }
  const top = num.length ? num.join('·') : '1';
  return den.length ? `${top}/${den.join('·')}` : top;
}

export function evaluateIndex(
  terms: IndexTerms,
  props: Partial<Record<IndexProp, number>>,
): number {
  let v = 1;
  for (const [p, e] of Object.entries(terms) as [IndexProp, number][]) {
    const x = props[p];
    if (x === undefined || !Number.isFinite(x) || x <= 0) return NaN;
    v *= x ** e;
  }
  return v;
}

/** Components whose index has no density term, so "min cost" cannot change the ranking. */
export const MASSLESS_INDEX: Component[] = ['hinge', 'thermal_shock'];

/**
 * Derive the material indices for a design. Beam/column exponents come from the section scaling:
 * stiffness-limited  → s ∝ E^(-1/pI), m ∝ ρ·s^pA  ⇒  index E^(pA/pI)/ρ
 * strength-limited   → s ∝ σ^(-1/pZ), m ∝ ρ·s^pA  ⇒  index σ^(pA/pZ)/ρ
 */
export interface CustomIndexInput {
  terms: IndexTerms;
  description: string;
  symbols: Record<string, string>;
}

export function deriveIndices(
  component: Component,
  criteria: Criterion[],
  section: Section,
  objective: Objective,
  custom: CustomIndexInput | null = null,
): IndexDef[] {
  const g =
    section === 'rect_fixed_width'
      ? { pA: 1, pI: 3, pZ: 2 } // shape only — width value is irrelevant to the exponents
      : { pA: 2, pI: 4, pZ: 3 };
  const panel = section === 'rect_fixed_width';
  const cost = objective === 'min_cost';
  const per = cost ? 'per unit cost' : 'per unit mass';
  const withCost = (t: IndexTerms): IndexTerms =>
    cost && t.density ? { ...t, price: -1 } : t;
  const defs: IndexDef[] = [];
  const add = (
    criterion: IndexDef['criterion'],
    terms: IndexTerms,
    description: string,
  ) => {
    const t = withCost(terms);
    defs.push({
      criterion,
      terms: t,
      expression: formatIndex(t, custom?.symbols),
      description,
    });
  };
  const has = (c: Criterion) => criteria.includes(c);

  switch (component) {
    case 'tie':
      if (has('stiffness'))
        add(
          'stiffness',
          { E: 1, density: -1 },
          `Stiff tie: most stretch resistance ${per}`,
        );
      if (has('strength'))
        add(
          'strength',
          { strength: 1, density: -1 },
          `Strong tie: most load before yielding ${per}`,
        );
      break;
    case 'beam':
      if (has('stiffness'))
        add(
          'stiffness',
          { E: g.pA / g.pI, density: -1 },
          panel
            ? `Stiff board/panel (width fixed, thickness free): least bending ${per}`
            : `Stiff beam (section size free): least bending ${per}`,
        );
      if (has('strength'))
        add(
          'strength',
          { strength: g.pA / g.pZ, density: -1 },
          panel
            ? `Strong board/panel (width fixed, thickness free): most bending load ${per}`
            : `Strong beam (section size free): most bending load ${per}`,
        );
      break;
    case 'column':
      // DECISION: buckling is a failure mode for any slender column, so the buckling index always applies;
      // the strength criterion adds the crushing index σ/ρ.
      add(
        'stiffness',
        { E: g.pA / g.pI, density: -1 },
        `Column that resists buckling ${per}`,
      );
      if (has('strength'))
        add(
          'strength',
          { strength: 1, density: -1 },
          `Column that resists crushing ${per}`,
        );
      break;
    case 'shaft':
      if (has('stiffness'))
        add(
          'stiffness',
          { G: 1 / 2, density: -1 },
          `Shaft that resists twisting ${per}`,
        );
      if (has('strength'))
        add(
          'strength',
          { strength: 2 / 3, density: -1 },
          `Shaft that carries torque without yielding ${per}`,
        );
      break;
    case 'spring':
      add(
        'single',
        { strength: 2, E: -1, density: -1 },
        `Spring: most stored elastic energy ${per}`,
      );
      break;
    case 'hinge':
      add(
        'single',
        { strength: 1, E: -1 },
        'Flexure hinge: bends furthest without yielding',
      );
      break;
    case 'insulation':
      add(
        'single',
        cost ? { lambda: -1, density: -1, price: -1 } : { lambda: -1 },
        cost
          ? 'Insulation: least heat flow per unit cost'
          : 'Insulation: least heat flow for a given thickness',
      );
      break;
    case 'thermal_shock':
      add(
        'single',
        { strength: 1, E: -1, alpha: -1 },
        'Survives the largest sudden temperature change',
      );
      break;
    case 'custom':
      if (custom && Object.keys(custom.terms).length) {
        // DECISION: "cheapest" with an index that has no density term still prefers cheaper stock (÷ price per kg).
        const t: IndexTerms = cost
          ? { ...custom.terms, price: -1 }
          : custom.terms;
        defs.push({
          criterion: 'single',
          terms: t,
          expression: formatIndex(t, custom.symbols),
          description: custom.description + (cost ? ' (per unit cost)' : ''),
        });
      } else if (cost)
        add(
          'single',
          { price: -1 },
          'Cheapest material per kg that meets every requirement',
        );
      else
        add(
          'single',
          { density: -1 },
          'Lightest material (lowest density) that meets every requirement',
        );
      break;
  }
  return defs;
}

// ---------------------------------------------------------------------------
// Sizing (SI)
// ---------------------------------------------------------------------------
export const BEAM_DEFLECTION_C: Record<Support, number> = {
  simply_supported_center: 48,
  simply_supported_uniform: 384 / 5,
  cantilever_end: 3,
};
export const BEAM_MOMENT_K: Record<Support, number> = {
  simply_supported_center: 1 / 4,
  simply_supported_uniform: 1 / 8,
  cantilever_end: 1,
};
export const EULER_K: Record<EndCondition, number> = {
  pinned_pinned: 1,
  fixed_free: 2,
  fixed_fixed: 0.5,
  fixed_pinned: 0.7,
};

export type ConstraintKey =
  | 'deflection'
  | 'bending'
  | 'stretch'
  | 'yield'
  | 'buckling'
  | 'crushing'
  | 'twist'
  | 'shear';

export const GOVERNING_TEXT: Record<ConstraintKey, string> = {
  deflection: 'the deflection (bending) limit',
  bending: 'bending strength',
  stretch: 'the stretch limit',
  yield: 'tensile strength',
  buckling: 'buckling',
  crushing: 'crushing strength',
  twist: 'the twist limit',
  shear: 'shear strength',
};

/** Loads and geometry already converted to SI. */
export interface SizingCase {
  component: 'beam' | 'tie' | 'column' | 'shaft';
  /** N for beam/tie/column, N·m torque for shaft. */
  load: number;
  lengthM: number;
  safetyFactor: number;
  /** Beam deflection or tie stretch limit (m), or null when stiffness isn't checked. */
  maxDeflectionM: number | null;
  /** Shaft twist limit (rad). */
  maxTwistRad: number | null;
  support: Support;
  endCondition: EndCondition;
  checkStiffness: boolean;
  checkStrength: boolean;
}

/** Material properties in SI for one evaluation (Pa, kg/m³). */
export interface SizingProps {
  E: number | null;
  G: number | null;
  strength: number | null;
}

export interface SizeResult {
  /** Characteristic size in metres. */
  size: number;
  governing: ConstraintKey;
  /** Size required by each active constraint (m). */
  bySize: Partial<Record<ConstraintKey, number>>;
}

/** Smallest characteristic size meeting every active constraint. Returns null if nothing is active. */
export function sizePart(
  c: SizingCase,
  g: SectionGeometry,
  p: SizingProps,
): SizeResult | null {
  const req: Partial<Record<ConstraintKey, number>> = {};
  const { load: F, lengthM: L, safetyFactor: SF } = c;

  switch (c.component) {
    case 'tie':
      // A = F·SF/σ ; stretch δ = F·L/(E·A) ⇒ A = F·L/(E·δ)
      if (c.checkStrength && p.strength)
        req.yield = solveSize((F * SF) / p.strength, g.cA, g.pA);
      if (c.checkStiffness && c.maxDeflectionM && p.E)
        req.stretch = solveSize((F * L) / (p.E * c.maxDeflectionM), g.cA, g.pA);
      break;
    case 'beam': {
      // δ = F·L³/(C·E·I) ; σ = M/Z ≤ σf/SF with M = k·F·L
      if (c.checkStiffness && c.maxDeflectionM && p.E) {
        const I =
          (F * L ** 3) /
          (BEAM_DEFLECTION_C[c.support] * p.E * c.maxDeflectionM);
        req.deflection = solveSize(I, g.cI, g.pI);
      }
      if (c.checkStrength && p.strength) {
        const M = BEAM_MOMENT_K[c.support] * F * L;
        req.bending = solveSize((M * SF) / p.strength, g.cZ, g.pZ);
      }
      break;
    }
    case 'column': {
      // Euler: F·SF ≤ π²·E·I/(K·L)² ; crushing A = F·SF/σ
      if (p.E) {
        const KL = EULER_K[c.endCondition] * L;
        req.buckling = solveSize(
          (F * SF * KL * KL) / (Math.PI ** 2 * p.E),
          g.cI,
          g.pI,
        );
      }
      if (p.strength)
        req.crushing = solveSize((F * SF) / p.strength, g.cA, g.pA);
      break;
    }
    case 'shaft': {
      if (g.cJ === null || g.cZp === null)
        throw new Error('shaft sizing needs a round section');
      // θ = T·L/(G·J) ; τ = T/Zp ≤ σ/(√3·SF)  (von Mises shear yield)
      if (c.checkStiffness && c.maxTwistRad && p.G)
        req.twist = solveSize((F * L) / (p.G * c.maxTwistRad), g.cJ, 4);
      if (c.checkStrength && p.strength)
        req.shear = solveSize((F * Math.sqrt(3) * SF) / p.strength, g.cZp, 3);
      break;
    }
  }

  let best: SizeResult | null = null;
  for (const [k, s] of Object.entries(req) as [ConstraintKey, number][]) {
    if (!Number.isFinite(s)) continue;
    if (!best || s > best.size) best = { size: s, governing: k, bySize: req };
  }
  return best;
}

/** Human-readable description of a sized section. */
export function describeSection(g: SectionGeometry, sizeM: number): string {
  const mm = (m: number) => formatMm(m * 1000);
  switch (g.section) {
    case 'solid_square':
      return `${mm(sizeM)} × ${mm(sizeM)} mm solid square bar`;
    case 'solid_round':
      return `Ø ${mm(sizeM)} mm solid round bar`;
    case 'round_tube':
      return `Ø ${mm(sizeM)} mm round tube, ${mm(sizeM / (g.tubeRatio ?? 15))} mm wall`;
    case 'square_tube':
      return `${mm(sizeM)} × ${mm(sizeM)} mm square tube, ${mm(sizeM / (g.tubeRatio ?? 15))} mm wall`;
    case 'rect_fixed_width':
      return `${mm(sizeM)} mm thick × ${mm(g.widthM ?? 0)} mm wide board`;
  }
}

/** Three significant figures, no trailing zeros noise. */
export function formatMm(x: number): string {
  if (x >= 100) return String(Math.round(x));
  if (x >= 10) return x.toFixed(1);
  if (x >= 1) return x.toFixed(2);
  return x.toPrecision(2);
}
