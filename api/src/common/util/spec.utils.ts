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

/** Check that every quantity in a spec uses a supported unit (throws UnitError). */
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

/** Map an engine UnitError to a 400 with an issue on the offending field. */
export function unitErrorToHttp(e: UnitError): AppException {
  return new AppException(e.message, 400, false, {
    issues: [
      {
        path: `spec.${e.field.split(' ')[0]}`,
        message: `Unknown unit "${e.unit}". Use one of: ${e.supported.join(', ')}`,
      },
    ],
  });
}

/** Validate and normalise a design spec from a request body (400 with issues on failure). */
export function parseSpec(input: unknown): DesignSpec {
  const spec = zodParse(DesignSpec, input, 'spec');
  try {
    assertUnits(spec);
  } catch (e) {
    if (e instanceof UnitError) throw unitErrorToHttp(e);
    throw e;
  }
  return spec;
}
