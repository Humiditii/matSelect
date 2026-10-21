'use client';

import { Penalty } from '@/lib/types';
import { Chip, NumberInput } from './ui';

/** Same defaults as the engine's DEFAULT_ALPHA. */
const DEFAULT_PENALTY: Penalty = { alphaMass: 1, alphaCo2: 0.1, rationale: '' };
const MASS_PRESETS = [
  { label: 'Everyday product', value: 1 },
  { label: 'Bike / sports gear', value: 10 },
  { label: 'Car part', value: 15 },
  { label: 'Drone / aircraft', value: 100 },
];
const CARBON_PRESETS = [
  { label: 'Ignore carbon', value: 0 },
  { label: '$50 / t', value: 0.05 },
  { label: '$100 / t', value: 0.1 },
  { label: '$200 / t', value: 0.2 },
];

/**
 * Exchange constants for the balanced goal (Ashby's penalty function Z = cost + α_m·mass + α_CO₂·CO₂):
 * how many dollars one kg saved, and one kg of CO₂ avoided, are worth to the user.
 */
export function PenaltyEditor({ value, onChange }: { value: Penalty | null | undefined; onChange: (p: Penalty) => void }) {
  const p = value ?? DEFAULT_PENALTY;
  const set = (patch: Partial<Penalty>) => onChange({ ...p, ...patch, rationale: '' });
  return (
    <div className="mt-3 space-y-3 rounded-xl bg-slate-50 p-4 ring-1 ring-inset ring-slate-200">
      <p className="text-sm text-slate-600">
        Ranked by the <strong className="font-medium text-slate-900">penalty</strong> Z = material cost + (value of weight) × mass + (carbon price) × CO₂. Lowest Z wins.
      </p>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="alpha-mass">
          Each kg saved is worth
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <span className="text-slate-500">$</span>
            <NumberInput ariaLabel="Dollars per kg saved" className="w-24" min={0} value={p.alphaMass} onChange={(v) => set({ alphaMass: Math.max(0, v ?? 0) })} />
          </div>
          {MASS_PRESETS.map((x) => (
            <Chip key={x.label} active={p.alphaMass === x.value} onClick={() => set({ alphaMass: x.value })}>
              {x.label}
            </Chip>
          ))}
        </div>
      </div>
      <div>
        <span className="mb-1 block text-sm font-medium text-slate-700">Carbon price</span>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <span className="text-slate-500">$</span>
            <NumberInput
              ariaLabel="Dollars per tonne of CO2"
              className="w-24"
              min={0}
              value={Math.round(p.alphaCo2 * 1000 * 100) / 100}
              onChange={(v) => set({ alphaCo2: Math.max(0, v ?? 0) / 1000 })}
            />
            <span className="text-sm text-slate-500">per tonne CO₂e</span>
          </div>
          {CARBON_PRESETS.map((x) => (
            <Chip key={x.label} active={p.alphaCo2 === x.value} onClick={() => set({ alphaCo2: x.value })}>
              {x.label}
            </Chip>
          ))}
        </div>
      </div>
      {value?.rationale && <p className="text-xs text-slate-500">Why these values: {value.rationale}</p>}
    </div>
  );
}
