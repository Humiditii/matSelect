import { formatNumber, formatUsd } from '@/lib/labels';
import type { SelectionResult } from '@/lib/types';

/** Formats a value of the ranking objective in its unit, e.g. "1.2 kg" or "$4.50". */
export function formatObjective(result: SelectionResult, value: number): string {
  switch (result.objectiveUnit) {
    case 'kg':
      return `${formatNumber(value)} kg`;
    case 'USD':
    case 'USD eq.':
      return formatUsd(value);
    case 'kg CO₂e':
      return `${formatNumber(value)} kg CO₂e`;
    default:
      return `${formatNumber(value)}%`;
  }
}

interface ObjectiveName {
  full: string;
  short: string;
}

const SIZED_OBJECTIVE_NAMES: Record<string, ObjectiveName> = {
  'USD eq.': { full: 'Penalty Z (cost + mass + carbon)', short: 'Penalty' },
  USD: { full: 'Material cost', short: 'Cost' },
  'kg CO₂e': { full: 'Part carbon footprint', short: 'Carbon' },
};
const PART_MASS: ObjectiveName = { full: 'Part mass', short: 'Mass' };
const INDEX_SCORE: ObjectiveName = { full: 'Index score', short: 'Score' };

/** What the objective value means: a property of the sized part, or an index score when nothing was sized. */
export function objectiveName(result: SelectionResult): ObjectiveName {
  if (result.mode !== 'sizing') return INDEX_SCORE;
  return SIZED_OBJECTIVE_NAMES[result.objectiveUnit] ?? PART_MASS;
}
