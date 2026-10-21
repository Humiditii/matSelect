// Sizes a beam, tie, column or shaft for one set of material properties.
// Everything is SI. Symbols used in the formulas:
//   F   load (N), or torque T (N·m) for a shaft
//   L   length or span (m)
//   SF  safety factor
//   E   Young's modulus (Pa)        G   shear modulus (Pa)
//   σ   strength (Pa)               δ   allowed deflection or stretch (m)
//   θ   allowed twist (rad)         A   cross-section area (m²)
//   I   second moment of area (m⁴)  Z   section modulus (m³)
//   J   polar moment (m⁴)           Zp  polar section modulus (m³)
//   M   bending moment (N·m)        K   effective-length factor for buckling
import { EndCondition, Support } from 'src/common/domain/domain.types';
import { SectionGeometry, solveSize } from './section';

/** C in δ = F·L³ / (C·E·I) for each beam support case. */
export const BEAM_DEFLECTION_C: Record<Support, number> = {
  simply_supported_center: 48,
  simply_supported_uniform: 384 / 5,
  cantilever_end: 3,
};

/** k in the peak bending moment M = k·F·L. */
export const BEAM_MOMENT_K: Record<Support, number> = {
  simply_supported_center: 1 / 4,
  simply_supported_uniform: 1 / 8,
  cantilever_end: 1,
};

/** K in Euler's buckling load π²·E·I / (K·L)². */
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

/** A part to size, with loads and lengths already converted to SI. */
export interface SizingCase {
  component: 'beam' | 'tie' | 'column' | 'shaft';
  /** N for a beam, tie or column; N·m of torque for a shaft. */
  load: number;
  lengthM: number;
  safetyFactor: number;
  /** Beam deflection or tie stretch limit, or null when stiffness isn't checked. */
  maxDeflectionM: number | null;
  /** Shaft twist limit. */
  maxTwistRad: number | null;
  support: Support;
  endCondition: EndCondition;
  checkStiffness: boolean;
  checkStrength: boolean;
}

/** Material properties in Pa. */
export interface SizingProps {
  E: number | null;
  G: number | null;
  strength: number | null;
}

export interface SizeResult {
  /** Characteristic size in metres. */
  size: number;
  /** The constraint that needs the biggest size. */
  governing: ConstraintKey;
  /** The size each active constraint needs (m). */
  bySize: Partial<Record<ConstraintKey, number>>;
}

/** The smallest size that meets every active constraint, or null if none is active. */
export function sizePart(
  part: SizingCase,
  geometry: SectionGeometry,
  props: SizingProps,
): SizeResult | null {
  const required: Partial<Record<ConstraintKey, number>> = {};
  const { load: F, lengthM: L, safetyFactor: SF } = part;
  const { cA, pA, cI, pI, cZ, pZ } = geometry;

  switch (part.component) {
    case 'tie':
      // Strength: A = F·SF/σ. Stretch: δ = F·L/(E·A), so A = F·L/(E·δ).
      if (part.checkStrength && props.strength)
        required.yield = solveSize((F * SF) / props.strength, cA, pA);
      if (part.checkStiffness && part.maxDeflectionM && props.E)
        required.stretch = solveSize(
          (F * L) / (props.E * part.maxDeflectionM),
          cA,
          pA,
        );
      break;
    case 'beam': {
      // Deflection: δ = F·L³/(C·E·I). Strength: M/Z <= σ/SF with M = k·F·L.
      if (part.checkStiffness && part.maxDeflectionM && props.E) {
        const I =
          (F * L ** 3) /
          (BEAM_DEFLECTION_C[part.support] * props.E * part.maxDeflectionM);
        required.deflection = solveSize(I, cI, pI);
      }
      if (part.checkStrength && props.strength) {
        const M = BEAM_MOMENT_K[part.support] * F * L;
        required.bending = solveSize((M * SF) / props.strength, cZ, pZ);
      }
      break;
    }
    case 'column': {
      // Euler buckling: F·SF <= π²·E·I/(K·L)². Crushing: A = F·SF/σ.
      if (props.E) {
        const KL = EULER_K[part.endCondition] * L;
        required.buckling = solveSize(
          (F * SF * KL * KL) / (Math.PI ** 2 * props.E),
          cI,
          pI,
        );
      }
      if (props.strength)
        required.crushing = solveSize((F * SF) / props.strength, cA, pA);
      break;
    }
    case 'shaft': {
      if (geometry.cJ === null || geometry.cZp === null)
        throw new Error('shaft sizing needs a round section');
      // Twist: θ = T·L/(G·J). Strength: T/Zp <= σ/(√3·SF), the von Mises shear yield.
      if (part.checkStiffness && part.maxTwistRad && props.G)
        required.twist = solveSize(
          (F * L) / (props.G * part.maxTwistRad),
          geometry.cJ,
          4,
        );
      if (part.checkStrength && props.strength)
        required.shear = solveSize(
          (F * Math.sqrt(3) * SF) / props.strength,
          geometry.cZp,
          3,
        );
      break;
    }
  }

  let best: SizeResult | null = null;
  for (const [constraint, size] of Object.entries(required) as [
    ConstraintKey,
    number,
  ][]) {
    if (!Number.isFinite(size)) continue;
    if (!best || size > best.size)
      best = { size, governing: constraint, bySize: required };
  }
  return best;
}
