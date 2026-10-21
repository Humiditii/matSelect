// Cross-section shapes and how their properties scale with size. All SI (m).
import { Family, Section } from 'src/common/domain/domain.types';

/**
 * Every section property scales as c * s^p with the characteristic size s
 * (side, outer diameter or plank thickness). Tubes keep outer size / wall
 * thickness = tubeRatio fixed, so they scale like solids. A plank keeps its
 * width fixed, so area grows with s, I with s³ and Z with s².
 */
export interface SectionGeometry {
  section: Section;
  /** Area A = cA * s^pA */
  cA: number;
  pA: number;
  /** Second moment of area I = cI * s^pI */
  cI: number;
  pI: number;
  /** Elastic section modulus Z = cZ * s^pZ */
  cZ: number;
  pZ: number;
  /** Polar moment J = cJ * s^4 (round sections only) */
  cJ: number | null;
  /** Polar section modulus Zp = cZp * s^3 (round sections only) */
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
      const innerRatio = 1 - 2 / tubeRatio; // inner / outer diameter
      const hollowFactor = 1 - innerRatio ** 4;
      return {
        ...base,
        tubeRatio,
        cA: (Math.PI / 4) * (1 - innerRatio * innerRatio),
        pA: 2,
        cI: (Math.PI / 64) * hollowFactor,
        pI: 4,
        cZ: (Math.PI / 32) * hollowFactor,
        pZ: 3,
        cJ: (Math.PI / 32) * hollowFactor,
        cZp: (Math.PI / 16) * hollowFactor,
      };
    }
    case 'square_tube': {
      const innerRatio = 1 - 2 / tubeRatio; // inner / outer side
      const hollowFactor = 1 - innerRatio ** 4;
      return {
        ...base,
        tubeRatio,
        cA: 1 - innerRatio * innerRatio,
        pA: 2,
        cI: hollowFactor / 12,
        pI: 4,
        cZ: hollowFactor / 6,
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

/** The smallest size s with c * s^p >= required. */
export const solveSize = (required: number, c: number, p: number) =>
  (required / c) ** (1 / p);

export const area = (geometry: SectionGeometry, size: number) =>
  geometry.cA * size ** geometry.pA;

/** Families that are not sold or made as thin-walled tube. They are sized as the solid equivalent. */
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

export function describeSection(
  geometry: SectionGeometry,
  sizeM: number,
): string {
  const mm = (metres: number) => formatMm(metres * 1000);
  const wall = () => mm(sizeM / (geometry.tubeRatio ?? 15));
  switch (geometry.section) {
    case 'solid_square':
      return `${mm(sizeM)} × ${mm(sizeM)} mm solid square bar`;
    case 'solid_round':
      return `Ø ${mm(sizeM)} mm solid round bar`;
    case 'round_tube':
      return `Ø ${mm(sizeM)} mm round tube, ${wall()} mm wall`;
    case 'square_tube':
      return `${mm(sizeM)} × ${mm(sizeM)} mm square tube, ${wall()} mm wall`;
    case 'rect_fixed_width':
      return `${mm(sizeM)} mm thick × ${mm(geometry.widthM ?? 0)} mm wide board`;
  }
}

/** Millimetres to about three significant figures. */
export function formatMm(x: number): string {
  if (x >= 100) return String(Math.round(x));
  if (x >= 10) return x.toFixed(1);
  if (x >= 1) return x.toFixed(2);
  return x.toPrecision(2);
}
