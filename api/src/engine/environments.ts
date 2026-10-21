// Demo-mode handling of custom environments. With Claude, every material gets
// its own rating for each custom environment. The built-in demo data has no
// such ratings, so the user's words are mapped onto the closest built-in
// environments instead, and the result says so.
import { DesignSpec, Environment } from 'src/common/domain/domain.types';
import { ENV_LABEL } from './labels';

const KEYWORDS: [RegExp, Environment[]][] = [
  [/\b(pool|chlorin\w*|hot ?tub|jacuzzi|spa)\b/, ['wet', 'chemical']],
  [
    /\b(sea|seaside|salt\w*|marine|boat|ship|beach|coast\w*|ocean|harbou?r|offshore)\b/,
    ['marine', 'outdoor'],
  ],
  [
    /\b(sauna|steam|humid\w*|bathroom|shower|condensation|damp|wet|water|river|lake|rain\w*|underground|soil|buried|mud|swamp)\b/,
    ['wet'],
  ],
  [
    /\b(garden|roof\w*|outside|outdoors?|balcony|sun\w*|snow|weather|desert|uv)\b/,
    ['outdoor'],
  ],
  [/\b(kitchen|food|drinks?|cook\w*|baby|toy)\b/, ['food_contact']],
  [
    /\b(acids?|alkali\w*|chemicals?|solvents?|fuel|petrol|gasoline|diesel|oil|bleach|fertili[sz]er|cleaning|detergent|lab\w*)\b/,
    ['chemical'],
  ],
];

export function impliedEnvironments(text: string): Environment[] {
  const lowerCase = text.toLowerCase();
  const found = new Set<Environment>();
  for (const [pattern, environments] of KEYWORDS)
    if (pattern.test(lowerCase)) environments.forEach((e) => found.add(e));
  return [...found];
}

/** Replaces custom environments with the closest built-in ones. Returns the spec for the engine and notes for the user. */
export function mapCustomEnvironments(spec: DesignSpec): {
  spec: DesignSpec;
  notes: string[];
} {
  if (!spec.customEnvironments.length) return { spec, notes: [] };
  const environments = new Set<Environment>(spec.environment);
  const notes: string[] = [];
  for (const custom of spec.customEnvironments) {
    const implied = impliedEnvironments(custom);
    implied.forEach((e) => environments.add(e));
    notes.push(
      implied.length
        ? `Demo mode can't rate materials for “${custom}”, so it was checked as: ${implied.map((e) => ENV_LABEL[e]).join(' + ')}. Add an LLM API key for a material-by-material rating.`
        : `Demo mode can't rate materials for “${custom}”, and it doesn't match any built-in condition, so it was NOT checked. Add an LLM API key to have every material rated for it.`,
    );
  }
  if (environments.size > 1) environments.delete('indoor');
  return {
    spec: { ...spec, environment: [...environments], customEnvironments: [] },
    notes,
  };
}
