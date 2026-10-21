// Grounding check: every number in an explanation must come from the explanation payload.
import { SelectionResult } from 'src/common/domain/domain.types';

// A unit stuck to a number ("25mm") is split off so the number is still found.
const UNIT_GLUE =
  /(\d)(mm|cm|km|kg|kN|N|m|MPa|GPa|°C|°|%|x|×|USD|s)(?![A-Za-z0-9])/g;
// Tokens mixing letters and digits are names, grades or labels (6061-T6, S355, PA66, p10, Ti-6Al-4V), not quantities.
const GRADE_TOKEN =
  /(?<![\w.])(?=[\w\-/.]*[A-Za-z])(?=[\w\-/.]*\d)[A-Za-z0-9]+(?:[-/.][A-Za-z0-9]+)*(?![\w])/g;
const NUMBER = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// All numbers written in a text, ignoring the given names and any grade-like tokens.
export function extractNumbers(
  text: string,
  ignoreTerms: string[] = [],
): { raw: string; value: number }[] {
  let cleaned = text;
  const termsWithDigits = ignoreTerms
    .filter((term) => term && /\d/.test(term))
    .sort((a, b) => b.length - a.length);
  for (const term of termsWithDigits)
    cleaned = cleaned.replace(new RegExp(escapeRegExp(term), 'gi'), ' ');
  cleaned = cleaned.replace(UNIT_GLUE, '$1 $2');
  cleaned = cleaned.replace(GRADE_TOKEN, ' ');
  // Superscripts and exponents in units (m³, m², 10^3) are not quantities.
  cleaned = cleaned
    .replace(/[²³¹⁰⁴⁵⁶⁷⁸⁹]/g, ' ')
    .replace(/\^\(?[\d/]+\)?/g, ' ');
  const out: { raw: string; value: number }[] = [];
  for (const match of cleaned.matchAll(NUMBER))
    out.push({ raw: match[0], value: Number(match[0].replace(/,/g, '')) });
  return out;
}

// Every number in the payload: numeric fields plus numbers written inside its strings.
function payloadNumbers(payload: unknown): number[] {
  const out: number[] = [];
  const walk = (value: unknown) => {
    if (typeof value === 'number' && Number.isFinite(value)) out.push(value);
    else if (typeof value === 'string')
      for (const found of extractNumbers(value)) out.push(found.value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object')
      Object.values(value).forEach(walk);
  };
  walk(payload);
  return out;
}

// A written number may be the payload value as a percentage, or after a unit change (x1000 or /1000).
const SCALES = [1, 100, 0.01, 1000, 0.001];

function matchesPayloadNumber(
  written: number,
  raw: string,
  payloadValue: number,
): boolean {
  const magnitude = Math.abs(payloadValue);
  for (const scale of SCALES) {
    const target = magnitude * scale;
    if (target === 0) {
      if (written === 0) return true;
      continue;
    }
    if (Math.abs(written - target) <= 0.05 * target) return true;
    // Also accept the value rounded to the precision written (e.g. "0.02" for 0.0249).
    const decimals = raw.includes('.') ? raw.split('.')[1].length : 0;
    if (Number(target.toFixed(decimals)) === written) return true;
  }
  return false;
}

/**
 * Each number in `text` must match a payload number within 5%, directly or after one of SCALES.
 * Small integers (10 or less) and material names and grades are ignored.
 */
export function checkGrounding(
  text: string,
  payload: unknown,
  ignoreTerms: string[] = [],
): { grounded: boolean; unverifiedNumbers: string[] } {
  const known = payloadNumbers(payload);
  const unverified = new Set<string>();
  for (const { raw, value } of extractNumbers(text, ignoreTerms)) {
    if (Number.isInteger(value) && value <= 10) continue;
    if (!known.some((p) => matchesPayloadNumber(value, raw, p)))
      unverified.add(raw);
  }
  return {
    grounded: unverified.size === 0,
    unverifiedNumbers: [...unverified],
  };
}

// Material names and grades, which often contain digits that are not quantities.
export function ignoreTermsFor(result: SelectionResult): string[] {
  const terms = new Set<string>();
  for (const material of result.materials) {
    terms.add(material.name);
    if (material.grade) terms.add(material.grade);
  }
  return [...terms];
}
