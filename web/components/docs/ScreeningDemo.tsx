'use client';

import { useState } from 'react';
import { Chip } from '../ui';
import { DEMO_MATERIALS, DemoMaterial, Rating } from './demoPhysics';

const RATING_ORDER: Rating[] = ['A', 'B', 'C', 'D', 'E'];
const atLeast = (rating: Rating, min: Rating) => RATING_ORDER.indexOf(rating) <= RATING_ORDER.indexOf(min);

interface Requirement {
  id: string;
  label: string;
  /** Returns the reason it fails, or null when it passes. */
  check: (m: DemoMaterial) => string | null;
}

// The same rules the engine uses (api/src/engine/screening.ts), cut down to a few examples.
const REQUIREMENTS: Requirement[] = [
  {
    id: 'outdoor',
    label: '🌦️ Lives outdoors',
    check: (m) => {
      const bad = [];
      if (!atLeast(m.ratings.freshWater, 'C')) bad.push(`water rating ${m.ratings.freshWater}`);
      if (!atLeast(m.ratings.uv, 'C')) bad.push(`sunlight rating ${m.ratings.uv}`);
      return bad.length ? `Not suited outdoors: ${bad.join(', ')} (needs C or better)` : null;
    },
  },
  {
    id: 'marine',
    label: '🌊 Sea water',
    check: (m) => (atLeast(m.ratings.saltWater, 'B') ? null : `Salt water rating ${m.ratings.saltWater} (needs B or better)`),
  },
  {
    id: 'hot',
    label: '🔥 Works at 120 °C',
    check: (m) => (m.tMax[0] < 120 ? `Maximum service temperature about ${m.tMax[0]}–${m.tMax[1]} °C; it must reliably handle 120 °C` : null),
  },
  {
    id: 'impact',
    label: '💥 Must survive knocks',
    check: (m) => (m.brittle ? 'Brittle: can crack or shatter under impact' : null),
  },
  {
    id: 'recyclable',
    label: '♻️ Recyclable',
    check: (m) => (m.recyclability === 'good' ? null : `Hard to recycle (recyclability: ${m.recyclability})`),
  },
  {
    id: 'handtools',
    label: '🪚 I only have a hand saw and a drill',
    check: (m) => {
      const bad = [];
      if (m.handCut === 'difficult' || m.handCut === 'no') bad.push(`hand saw (${m.handCut})`);
      if (m.drill === 'difficult' || m.drill === 'no') bad.push(`drill (${m.drill})`);
      return bad.length ? `Hard to work with your tools: ${bad.join(', ')}` : null;
    },
  },
];

export function ScreeningDemo() {
  const [active, setActive] = useState<string[]>(['outdoor']);
  const toggle = (id: string) => setActive((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  const rows = DEMO_MATERIALS.map((m) => ({
    material: m,
    reasons: REQUIREMENTS.filter((r) => active.includes(r.id))
      .map((r) => r.check(m))
      .filter((reason): reason is string => reason !== null),
  }));
  const passing = rows.filter((r) => !r.reasons.length).length;

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {REQUIREMENTS.map((r) => (
          <Chip key={r.id} active={active.includes(r.id)} onClick={() => toggle(r.id)}>
            {r.label}
          </Chip>
        ))}
      </div>
      <p className="mt-3 text-sm text-slate-600">
        <strong className="text-slate-900">{passing}</strong> of {rows.length} materials pass.
      </p>
      <ul className="mt-2 divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
        {rows.map(({ material, reasons }) => (
          <li key={material.id} className="flex gap-3 px-3 py-2 text-sm">
            <span aria-hidden className={reasons.length ? 'text-rose-600' : 'text-emerald-600'}>
              {reasons.length ? '✕' : '✓'}
            </span>
            <span className="min-w-0">
              <span className={reasons.length ? 'text-slate-500 line-through decoration-slate-300' : 'font-medium text-slate-900'}>{material.name}</span>
              {reasons.map((reason) => (
                <span key={reason} className="block text-xs text-rose-700">
                  {reason}
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
