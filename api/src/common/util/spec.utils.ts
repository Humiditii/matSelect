import { DesignSpec } from 'src/common/domain/domain.types';
import {
  UnitError,
  isTorqueUnit,
  toMetres,
  toNewtonMetres,
  toNewtons,
} from 'src/engine/units';
import { AppException } from '../appResponse.parser';
import { zodParse } from './validation.utils';

// Throws a UnitError if any quantity in the spec uses an unsupported unit.
export function assertUnits(spec: DesignSpec): void {
  if (spec.load) {
    if (spec.component === 'shaft' || isTorqueUnit(spec.load.unit))
      toNewtonMetres(spec.load, 'load');
    else toNewtons(spec.load, 'load');
  }
  if (spec.length) toMetres(spec.length, 'length');
  if (spec.maxDeflection) toMetres(spec.maxDeflection, 'maxDeflection');
  if (spec.sectionWidth) toMetres(spec.sectionWidth, 'sectionWidth');
}

// A 400 whose issue points at the field with the unknown unit.
export function unitErrorToHttp(error: UnitError): AppException {
  return new AppException(error.message, 400, false, {
    issues: [
      {
        path: `spec.${error.field.split(' ')[0]}`,
        message: `Unknown unit "${error.unit}". Use one of: ${error.supported.join(', ')}`,
      },
    ],
  });
}

// Validates and normalises a spec from a request body, or throws a 400 listing the issues.
export function parseSpec(input: unknown): DesignSpec {
  const spec = zodParse(DesignSpec, input, 'spec');
  try {
    assertUnits(spec);
  } catch (err) {
    if (err instanceof UnitError) throw unitErrorToHttp(err);
    throw err;
  }
  return spec;
}
