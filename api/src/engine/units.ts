import { Quantity } from 'src/common/domain/domain.types';

const G0 = 9.80665; // standard gravity, m/s²
const LBF_N = 4.4482216152605;

export class UnitError extends Error {
  constructor(
    public readonly field: string,
    public readonly unit: string,
    public readonly supported: string[],
  ) {
    super(
      `Unknown unit "${unit}" for ${field}. Supported units: ${supported.join(', ')}`,
    );
    this.name = 'UnitError';
  }
}

// Case-insensitive, and "·", "*", "-", "." and spaces are all accepted between
// units, so "N·m", "N m" and "nm" match the same entry.
function normaliseUnit(unit: string): string {
  return unit
    .trim()
    .toLowerCase()
    .replace(/[\s*·.\-]+/g, '');
}

// Force: "kg" and "lb" mean the weight of that mass (kgf / lbf).
const FORCE: Record<string, number> = {
  n: 1,
  newton: 1,
  newtons: 1,
  kn: 1000,
  kilonewton: 1000,
  kilonewtons: 1000,
  kg: G0,
  kgf: G0,
  kilogram: G0,
  kilograms: G0,
  lb: LBF_N,
  lbs: LBF_N,
  lbf: LBF_N,
  pound: LBF_N,
  pounds: LBF_N,
};

const LENGTH: Record<string, number> = {
  mm: 1e-3,
  millimeter: 1e-3,
  millimeters: 1e-3,
  millimetre: 1e-3,
  millimetres: 1e-3,
  cm: 1e-2,
  m: 1,
  meter: 1,
  meters: 1,
  metre: 1,
  metres: 1,
  in: 0.0254,
  inch: 0.0254,
  inches: 0.0254,
  '"': 0.0254,
  ft: 0.3048,
  foot: 0.3048,
  feet: 0.3048,
  "'": 0.3048,
};

const TORQUE: Record<string, number> = {
  nm: 1,
  newtonmeter: 1,
  newtonmeters: 1,
  newtonmetre: 1,
  newtonmetres: 1,
  knm: 1000,
  lbfft: LBF_N * 0.3048,
  lbft: LBF_N * 0.3048,
  ftlb: LBF_N * 0.3048,
  ftlbf: LBF_N * 0.3048,
  lbfin: LBF_N * 0.0254,
  inlb: LBF_N * 0.0254,
};

export const SUPPORTED_UNITS = {
  force: ['N', 'kN', 'kg', 'lb'],
  length: ['mm', 'cm', 'm', 'in', 'ft'],
  torque: ['N·m', 'kN·m', 'lbf·ft', 'lbf·in'],
};

function convert(
  quantity: Quantity,
  toSi: Record<string, number>,
  field: string,
  supported: string[],
): number {
  const factor = toSi[normaliseUnit(quantity.unit)];
  if (factor === undefined)
    throw new UnitError(field, quantity.unit, supported);
  return quantity.value * factor;
}

export const toNewtons = (quantity: Quantity, field = 'load') =>
  convert(quantity, FORCE, field, SUPPORTED_UNITS.force);
export const toMetres = (quantity: Quantity, field = 'length') =>
  convert(quantity, LENGTH, field, SUPPORTED_UNITS.length);
export const toNewtonMetres = (quantity: Quantity, field = 'load') =>
  convert(quantity, TORQUE, field, SUPPORTED_UNITS.torque);

export const isTorqueUnit = (unit: string) =>
  TORQUE[normaliseUnit(unit)] !== undefined;
