'use client';

import { useState } from 'react';
import { materialName } from '@/lib/labels';
import type { ExcludedMaterial } from '@/lib/types';
import { FamilyBadge } from './FamilyBadge';

const COLLAPSED_COUNT = 8;

/** Materials that were ruled out or not evaluated, each with the reasons why. */
export function ExcludedList({ items, emptyText }: { items: ExcludedMaterial[]; emptyText: string }) {
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState('');
  const query = search.toLowerCase();
  const matching = items.filter((item) => `${item.name} ${item.grade ?? ''} ${item.reasons.join(' ')}`.toLowerCase().includes(query));
  const shown = showAll || search ? matching : matching.slice(0, COLLAPSED_COUNT);

  if (!items.length) return <p className="text-sm text-slate-500">{emptyText}</p>;

  return (
    <div>
      {items.length > COLLAPSED_COUNT && (
        <input
          className="mb-3 block w-full rounded-xl border-0 px-3 py-2 text-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-brand-500 sm:max-w-xs"
          placeholder="Search materials or reasons…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}
      <ul className="divide-y divide-slate-100">
        {shown.map((item) => (
          <li key={item.materialId} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:gap-4">
            <div className="flex shrink-0 items-start gap-2 sm:w-72">
              <span className="font-medium text-slate-900">{materialName(item)}</span>
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <div>
                <FamilyBadge family={item.family} />
              </div>
              <ul className="text-sm text-slate-600">
                {item.reasons.map((reason, i) => (
                  <li key={i} className="flex gap-2">
                    <span aria-hidden className="text-rose-500">✕</span>
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          </li>
        ))}
      </ul>
      {!search && matching.length > COLLAPSED_COUNT && (
        <button className="mt-2 text-sm font-semibold text-brand-700 hover:underline" onClick={() => setShowAll((value) => !value)}>
          {showAll ? 'Show fewer' : `Show all ${matching.length}`}
        </button>
      )}
    </div>
  );
}
