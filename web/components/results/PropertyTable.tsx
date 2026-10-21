'use client';

import { useState } from 'react';
import { CONFIDENCE_STYLE, FAMILY_LABEL, RATING_STYLE, formatRange } from '@/lib/labels';
import { FAMILIES, Family, SelectionResult } from '@/lib/types';
import { Badge, cx } from '../ui';

const RATING_MEANINGS = [
  { rating: 'A', meaning: 'excellent' },
  { rating: 'B', meaning: 'good' },
  { rating: 'C', meaning: 'average' },
  { rating: 'D', meaning: 'poor' },
  { rating: 'E', meaning: 'unacceptable' },
];

// Must match how the server keys custom environment ratings.
const customRatingKey = (environment: string) => environment.trim().toLowerCase().replace(/\s+/g, ' ');

const truncateHeading = (text: string) => (text.length > 18 ? `${text.slice(0, 17)}…` : text);

function RatingCell({ rating }: { rating: string | null }) {
  if (!rating) return <span className="text-slate-300">—</span>;
  return <span className={cx('inline-block w-6 rounded text-center text-xs font-bold', RATING_STYLE[rating])}>{rating}</span>;
}

/** The property data of every candidate, filterable by family. Materials that fit are highlighted. */
export function PropertyTable({ result }: { result: SelectionResult }) {
  const [familyFilter, setFamilyFilter] = useState<Family | 'all'>('all');
  const fittingIds = new Set(result.ranking.map((material) => material.materialId));
  const materials = result.materials.filter((material) => familyFilter === 'all' || material.family === familyFilter);
  const customProperties = result.spec.customProperties ?? [];
  const customEnvironments = result.spec.customEnvironments ?? [];

  return (
    <>
      <p className="mb-3 text-sm text-slate-600">
        AI-estimated typical ranges ({result.dataSource === 'mock' ? 'built-in demo data' : 'from the LLM'}). Verify with supplier datasheets before
        buying.
      </p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(['all', ...FAMILIES] as const).map((family) => (
          <button
            key={family}
            onClick={() => setFamilyFilter(family)}
            className={cx(
              'rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset',
              familyFilter === family ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50',
            )}
          >
            {family === 'all' ? 'All' : FAMILY_LABEL[family].label}
          </button>
        ))}
      </div>
      <div className="-mx-4 overflow-x-auto sm:-mx-6">
        <table className="min-w-full text-left text-xs">
          <thead className="border-b border-slate-200 uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 sm:pl-6">Material</th>
              <th className="px-2 py-2">Density kg/m³</th>
              <th className="px-2 py-2">E GPa</th>
              <th className="px-2 py-2">Strength MPa</th>
              <th className="px-2 py-2">Max °C</th>
              <th className="px-2 py-2">Price $/kg</th>
              <th className="px-2 py-2 normal-case">CO₂e kg/kg</th>
              <th className="px-2 py-2">Water</th>
              <th className="px-2 py-2">UV</th>
              {customProperties.map((property) => (
                <th key={property.key} className="px-2 py-2 normal-case">
                  {property.label}
                  {property.unit && <span className="block font-normal text-slate-400">{property.unit}</span>}
                </th>
              ))}
              {customEnvironments.map((environment) => (
                <th key={environment} className="max-w-28 px-2 py-2 normal-case" title={environment}>
                  “{truncateHeading(environment)}”
                </th>
              ))}
              <th className="px-2 py-2">Conf.</th>
              <th className="px-2 py-2 sm:pr-6">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {materials.map((material) => {
              const fits = fittingIds.has(material.id);
              return (
                <tr key={material.id} className={cx('align-top', fits && 'bg-emerald-50/40')}>
                  <td className="min-w-44 px-4 py-2 sm:pl-6">
                    <div className="font-medium text-slate-900">
                      {fits && <span title="Fits every requirement">✅ </span>}
                      {material.name}
                    </div>
                    <div className="text-slate-500">{[material.grade, FAMILY_LABEL[material.family].label].filter(Boolean).join(' · ')}</div>
                  </td>
                  <td className="whitespace-nowrap px-2 py-2">{formatRange(material.density)}</td>
                  <td className="whitespace-nowrap px-2 py-2">{formatRange(material.E)}</td>
                  <td className="whitespace-nowrap px-2 py-2">{formatRange(material.strength)}</td>
                  <td className="whitespace-nowrap px-2 py-2">{formatRange(material.tMax)}</td>
                  <td className="whitespace-nowrap px-2 py-2">{formatRange(material.price)}</td>
                  <td className="whitespace-nowrap px-2 py-2">{formatRange(material.co2 ?? null)}</td>
                  <td className="px-2 py-2">
                    <RatingCell rating={material.ratings.fresh_water} />
                  </td>
                  <td className="px-2 py-2">
                    <RatingCell rating={material.ratings.uv} />
                  </td>
                  {customProperties.map((property) => (
                    <td key={property.key} className="whitespace-nowrap px-2 py-2">
                      {formatRange(material.extra?.[property.key] ?? null)}
                    </td>
                  ))}
                  {customEnvironments.map((environment) => (
                    <td key={environment} className="px-2 py-2">
                      <RatingCell rating={material.customRatings?.[customRatingKey(environment)] ?? null} />
                    </td>
                  ))}
                  <td className="px-2 py-2">
                    <Badge className={CONFIDENCE_STYLE[material.confidence]}>{material.confidence}</Badge>
                  </td>
                  <td className="min-w-64 px-2 py-2 text-slate-600 sm:pr-6">{material.notes}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        Ratings:
        {RATING_MEANINGS.map(({ rating, meaning }) => (
          <span key={rating} className="flex items-center gap-1">
            <RatingCell rating={rating} /> {meaning}
          </span>
        ))}
        <span>· “—” = unknown (never guessed)</span>
      </p>
    </>
  );
}
