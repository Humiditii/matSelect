'use client';

import { useState } from 'react';
import {
  COMPONENT_LABEL,
  ENV_LABEL,
  MUST_HAVE_LABEL,
  PROCESS_LABEL,
  SAFETY_LABEL,
  propertyInfo,
} from '@/lib/labels';
import { DesignSpec, ENVIRONMENTS, FORCE_UNITS, LENGTH_UNITS, PropertyLimit, TORQUE_UNITS } from '@/lib/types';
import { CountrySelect } from './CountrySelect';
import { PenaltyEditor } from './PenaltyEditor';
import { CustomEnvInput } from './SpecEditor';
import { Button, Card, Chip, NumberInput, QuantityInput, Segmented, cx, inputClass } from './ui';

const SIZED = ['beam', 'tie', 'column', 'shaft'];

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

/** A removable pill for a requirement that is on. */
function Pill({ children, onRemove, title }: { children: React.ReactNode; onRemove: () => void; title?: string }) {
  return (
    <span title={title} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 py-1 pl-3 pr-1 text-sm text-slate-800 ring-1 ring-inset ring-slate-200">
      {children}
      <button type="button" aria-label="Remove" onClick={onRemove} className="grid h-6 w-6 place-items-center rounded-full text-slate-400 hover:bg-rose-100 hover:text-rose-700">
        ✕
      </button>
    </span>
  );
}

function LimitRow({ spec, limit, onChange, onRemove }: { spec: DesignSpec; limit: PropertyLimit; onChange: (l: PropertyLimit) => void; onRemove: () => void }) {
  const info = propertyInfo(spec, limit.property);
  return (
    <li className="flex flex-col gap-2 rounded-xl bg-slate-50 p-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-900">{info.label}</p>
        {limit.reason && <p className="text-xs text-slate-500">{limit.reason}</p>}
      </div>
      <div className="flex items-center gap-2 text-sm text-slate-600">
        <NumberInput ariaLabel={`${info.label} minimum`} className="w-24" value={limit.min} placeholder="min" onChange={(min) => onChange({ ...limit, min })} />
        <span>to</span>
        <NumberInput ariaLabel={`${info.label} maximum`} className="w-24" value={limit.max} placeholder="max" onChange={(max) => onChange({ ...limit, max })} />
        <span className="w-16 text-xs">{info.unit}</span>
        <button type="button" aria-label={`Remove ${info.label} requirement`} onClick={onRemove} className="rounded-full p-1 text-slate-400 hover:bg-rose-100 hover:text-rose-700">
          ✕
        </button>
      </div>
    </li>
  );
}

/**
 * The short brief: what it is, the goal and the requirements — everything the engine needs, without a form.
 * Users refine it in plain words with "Anything else?"; every detail is still editable under "Fine-tune".
 */
export function BriefEditor({
  spec,
  onChange,
  onRefine,
  refining,
}: {
  spec: DesignSpec;
  onChange: (patch: Partial<DesignSpec>) => void;
  /** Re-read the brief from the description plus this extra sentence. */
  onRefine: (extra: string) => void;
  refining: boolean;
}) {
  const [extra, setExtra] = useState('');
  const sized = SIZED.includes(spec.component);
  const custom = spec.component === 'custom';
  const goalOptions = custom
    ? [
        { value: 'min_mass' as const, label: '🏆 Best performance' },
        { value: 'min_cost' as const, label: '💲 Best value for money' },
        { value: 'min_carbon' as const, label: '🌱 Lowest carbon' },
        { value: 'balanced' as const, label: '⚖️ Balanced' },
      ]
    : [
        { value: 'min_mass' as const, label: '🪶 As light as possible' },
        { value: 'min_cost' as const, label: '💲 As cheap as possible' },
        { value: 'min_carbon' as const, label: '🌱 Lowest carbon' },
        { value: 'balanced' as const, label: '⚖️ Balanced' },
      ];
  const submitExtra = () => {
    if (extra.trim().length < 3) return;
    onRefine(extra.trim());
    setExtra('');
  };

  return (
    <Card>
      <div className="space-y-6">
        {/* What it is */}
        <div>
          <input
            aria-label="Name"
            className="w-full rounded-lg border-0 bg-transparent p-0 text-2xl font-bold tracking-tight text-slate-900 focus:bg-slate-50 focus:ring-2 focus:ring-brand-500"
            value={spec.title}
            maxLength={120}
            onChange={(e) => onChange({ title: e.target.value })}
          />
          <p className="mt-1 text-sm text-slate-600">
            {spec.function || (
              <>
                {COMPONENT_LABEL[spec.component].icon} {COMPONENT_LABEL[spec.component].label}
              </>
            )}
          </p>
        </div>

        {/* Goal */}
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Goal</h3>
          <Segmented value={spec.objective} onChange={(objective) => onChange({ objective })} options={goalOptions} />
          {custom && spec.customObjective && (
            <p className="mt-2 text-sm text-slate-600">
              Ranked by: <strong className="font-medium text-slate-900">{spec.customObjective.description}</strong>
              {spec.objective === 'min_cost' && ', per dollar'}
              {spec.objective === 'min_carbon' && ', per kg CO₂e'}
              {spec.objective === 'balanced' && ', per unit of penalty'}
            </p>
          )}
          {spec.objective === 'balanced' && <PenaltyEditor value={spec.penalty} onChange={(penalty) => onChange({ penalty })} />}
        </section>

        {/* Optional size */}
        {sized && (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Size it <span className="font-normal normal-case text-slate-400">(optional — gives the part size, mass and cost)</span>
            </h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <QuantityInput
                ariaLabel={spec.component === 'shaft' ? 'Torque' : 'Load'}
                value={spec.load}
                onChange={(load) => onChange({ load })}
                units={spec.component === 'shaft' ? TORQUE_UNITS : FORCE_UNITS}
                defaultUnit={spec.component === 'shaft' ? 'N·m' : 'kg'}
                placeholder={spec.component === 'shaft' ? 'Torque' : 'Load'}
              />
              <QuantityInput ariaLabel="Length" value={spec.length} onChange={(length) => onChange({ length })} units={LENGTH_UNITS} defaultUnit="m" placeholder="Span / length" />
              {spec.component !== 'column' && spec.component !== 'shaft' && (
                <QuantityInput
                  ariaLabel="Max bending"
                  value={spec.maxDeflection}
                  onChange={(maxDeflection) => onChange({ maxDeflection })}
                  units={LENGTH_UNITS}
                  defaultUnit="mm"
                  placeholder={spec.component === 'tie' ? 'Max stretch' : 'Max bending'}
                />
              )}
            </div>
          </section>
        )}

        {/* Requirements */}
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Must</h3>
          {spec.propertyLimits.length > 0 && (
            <ul className="mb-3 space-y-2">
              {spec.propertyLimits.map((l, i) => (
                <LimitRow
                  key={`${l.property}-${i}`}
                  spec={spec}
                  limit={l}
                  onChange={(nl) => onChange({ propertyLimits: spec.propertyLimits.map((x, k) => (k === i ? nl : x)) })}
                  onRemove={() => onChange({ propertyLimits: spec.propertyLimits.filter((_, k) => k !== i) })}
                />
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            {spec.tempRangeC && (
              <Pill onRemove={() => onChange({ tempRangeC: null })}>
                🌡️ Work from {spec.tempRangeC[0]} to {spec.tempRangeC[1]} °C
              </Pill>
            )}
            {spec.mustHave.map((m) => (
              <Pill key={m} onRemove={() => onChange({ mustHave: spec.mustHave.filter((x) => x !== m) })}>
                {MUST_HAVE_LABEL[m]}
              </Pill>
            ))}
            {spec.requiredProcesses.length > 0 && (
              <Pill onRemove={() => onChange({ requiredProcesses: [] })} title="Every one must work on the material">
                🔧 Workable with: {spec.requiredProcesses.map((p) => PROCESS_LABEL[p].toLowerCase()).join(', ')}
              </Pill>
            )}
            {spec.safetyClass !== 'general' && (
              <Pill onRemove={() => onChange({ safetyClass: 'general', safetyFactor: null })} title="Bigger safety margin and a safety note">
                🦺 {SAFETY_LABEL[spec.safetyClass].label}
              </Pill>
            )}
          </div>
        </section>

        {/* Environment */}
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Where it’s used</h3>
          <div className="flex flex-wrap gap-2">
            {ENVIRONMENTS.map((e) => (
              <Chip key={e} active={spec.environment.includes(e)} onClick={() => onChange({ environment: toggle(spec.environment, e) })}>
                <span aria-hidden>{ENV_LABEL[e].icon}</span> {ENV_LABEL[e].label}
              </Chip>
            ))}
          </div>
          <CustomEnvInput values={spec.customEnvironments} onChange={(customEnvironments) => onChange({ customEnvironments })} />
          <label htmlFor="brief-country" className="mt-4 block text-sm font-medium text-slate-700">
            Your country <span className="font-normal text-slate-500">(optional — for locally available materials and suppliers)</span>
          </label>
          <CountrySelect id="brief-country" className="mt-1 max-w-xs" value={spec.country} onChange={(country) => onChange({ country })} />
        </section>

        {/* Refine in plain words */}
        <section className="rounded-xl bg-brand-50/60 p-4 ring-1 ring-inset ring-brand-100">
          <h3 className="text-sm font-semibold text-slate-900">Anything else?</h3>
          <p className="mb-2 text-xs text-slate-600">Say it in your own words and we’ll update the brief — e.g. “it must survive 600 °C”, “I only have a drill”, “under $20”.</p>
          <div className="flex gap-2">
            <input
              className={cx(inputClass, 'bg-white')}
              value={extra}
              disabled={refining}
              maxLength={300}
              aria-label="Add a requirement in your own words"
              placeholder="Add a requirement…"
              onChange={(e) => setExtra(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submitExtra();
                }
              }}
            />
            <Button onClick={submitExtra} busy={refining} disabled={extra.trim().length < 3}>
              Update
            </Button>
          </div>
        </section>
      </div>
    </Card>
  );
}
