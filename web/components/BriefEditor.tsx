'use client';

import { useState } from 'react';
import {
  COMPONENT_LABEL,
  CUSTOM_GOAL_OPTIONS,
  ENV_LABEL,
  GOAL_OPTIONS,
  MUST_HAVE_LABEL,
  PROCESS_LABEL,
  SAFETY_LABEL,
  propertyInfo,
} from '@/lib/labels';
import { isSizedComponent } from '@/lib/spec';
import { DesignSpec, ENVIRONMENTS, FORCE_UNITS, LENGTH_UNITS, PropertyLimit, TORQUE_UNITS } from '@/lib/types';
import { CountrySelect } from './CountrySelect';
import { CustomEnvironmentInput } from './CustomEnvironmentInput';
import { PenaltyEditor } from './PenaltyEditor';
import { Button, Card, Chip, NumberInput, QuantityInput, Segmented, cx, inputClass, toggleItem } from './ui';

const SECTION_HEADING = 'mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500';

// How the custom objective is measured under each goal.
const CUSTOM_GOAL_SUFFIX: Partial<Record<DesignSpec['objective'], string>> = {
  min_cost: ', per dollar',
  min_carbon: ', per kg CO₂e',
  balanced: ', per unit of penalty',
};

/** A requirement that is switched on, with a button to remove it. */
function RequirementPill({ children, onRemove, title }: { children: React.ReactNode; onRemove: () => void; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 py-1 pl-3 pr-1 text-sm text-slate-800 ring-1 ring-inset ring-slate-200"
    >
      {children}
      <button
        type="button"
        aria-label="Remove"
        onClick={onRemove}
        className="grid h-6 w-6 place-items-center rounded-full text-slate-400 hover:bg-rose-100 hover:text-rose-700"
      >
        ✕
      </button>
    </span>
  );
}

function PropertyLimitRow({
  spec,
  limit,
  onChange,
  onRemove,
}: {
  spec: DesignSpec;
  limit: PropertyLimit;
  onChange: (limit: PropertyLimit) => void;
  onRemove: () => void;
}) {
  const info = propertyInfo(spec, limit.property);
  return (
    <li className="flex flex-col gap-2 rounded-xl bg-slate-50 p-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-900">{info.label}</p>
        {limit.reason && <p className="text-xs text-slate-500">{limit.reason}</p>}
      </div>
      <div className="flex items-center gap-2 text-sm text-slate-600">
        <NumberInput
          ariaLabel={`${info.label} minimum`}
          className="w-24"
          value={limit.min}
          placeholder="min"
          onChange={(min) => onChange({ ...limit, min })}
        />
        <span>to</span>
        <NumberInput
          ariaLabel={`${info.label} maximum`}
          className="w-24"
          value={limit.max}
          placeholder="max"
          onChange={(max) => onChange({ ...limit, max })}
        />
        <span className="w-16 text-xs">{info.unit}</span>
        <button
          type="button"
          aria-label={`Remove ${info.label} requirement`}
          onClick={onRemove}
          className="rounded-full p-1 text-slate-400 hover:bg-rose-100 hover:text-rose-700"
        >
          ✕
        </button>
      </div>
    </li>
  );
}

/**
 * The short version of the spec: what it is, the goal and the requirements.
 * Users change it in plain words with "Anything else?". Every field is also in SpecEditor under "Fine-tune".
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
  const isCustom = spec.component === 'custom';
  const isShaft = spec.component === 'shaft';
  const loadLabel = isShaft ? 'Torque' : 'Load';
  const submitExtra = () => {
    if (extra.trim().length < 3) return;
    onRefine(extra.trim());
    setExtra('');
  };

  return (
    <Card>
      <div className="space-y-6">
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

        <section>
          <h3 className={SECTION_HEADING}>Goal</h3>
          <Segmented
            value={spec.objective}
            onChange={(objective) => onChange({ objective })}
            options={isCustom ? CUSTOM_GOAL_OPTIONS : GOAL_OPTIONS}
          />
          {isCustom && spec.customObjective && (
            <p className="mt-2 text-sm text-slate-600">
              Ranked by: <strong className="font-medium text-slate-900">{spec.customObjective.description}</strong>
              {CUSTOM_GOAL_SUFFIX[spec.objective]}
            </p>
          )}
          {spec.objective === 'balanced' && <PenaltyEditor value={spec.penalty} onChange={(penalty) => onChange({ penalty })} />}
        </section>

        {isSizedComponent(spec.component) && (
          <section>
            <h3 className={SECTION_HEADING}>
              Size it <span className="font-normal normal-case text-slate-400">(optional — gives the part size, mass and cost)</span>
            </h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <QuantityInput
                ariaLabel={loadLabel}
                value={spec.load}
                onChange={(load) => onChange({ load })}
                units={isShaft ? TORQUE_UNITS : FORCE_UNITS}
                defaultUnit={isShaft ? 'N·m' : 'kg'}
                placeholder={loadLabel}
              />
              <QuantityInput
                ariaLabel="Length"
                value={spec.length}
                onChange={(length) => onChange({ length })}
                units={LENGTH_UNITS}
                defaultUnit="m"
                placeholder="Span / length"
              />
              {spec.component !== 'column' && !isShaft && (
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

        <section>
          <h3 className={SECTION_HEADING}>Must</h3>
          {spec.propertyLimits.length > 0 && (
            <ul className="mb-3 space-y-2">
              {spec.propertyLimits.map((limit, index) => (
                <PropertyLimitRow
                  key={`${limit.property}-${index}`}
                  spec={spec}
                  limit={limit}
                  onChange={(changed) => onChange({ propertyLimits: spec.propertyLimits.map((other, k) => (k === index ? changed : other)) })}
                  onRemove={() => onChange({ propertyLimits: spec.propertyLimits.filter((_, k) => k !== index) })}
                />
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            {spec.tempRangeC && (
              <RequirementPill onRemove={() => onChange({ tempRangeC: null })}>
                🌡️ Work from {spec.tempRangeC[0]} to {spec.tempRangeC[1]} °C
              </RequirementPill>
            )}
            {spec.mustHave.map((mustHave) => (
              <RequirementPill key={mustHave} onRemove={() => onChange({ mustHave: spec.mustHave.filter((x) => x !== mustHave) })}>
                {MUST_HAVE_LABEL[mustHave]}
              </RequirementPill>
            ))}
            {spec.requiredProcesses.length > 0 && (
              <RequirementPill onRemove={() => onChange({ requiredProcesses: [] })} title="Every one must work on the material">
                🔧 Workable with: {spec.requiredProcesses.map((process) => PROCESS_LABEL[process].toLowerCase()).join(', ')}
              </RequirementPill>
            )}
            {spec.safetyClass !== 'general' && (
              <RequirementPill onRemove={() => onChange({ safetyClass: 'general', safetyFactor: null })} title="Bigger safety margin and a safety note">
                🦺 {SAFETY_LABEL[spec.safetyClass].label}
              </RequirementPill>
            )}
          </div>
        </section>

        <section>
          <h3 className={SECTION_HEADING}>Where it’s used</h3>
          <div className="flex flex-wrap gap-2">
            {ENVIRONMENTS.map((environment) => (
              <Chip
                key={environment}
                active={spec.environment.includes(environment)}
                onClick={() => onChange({ environment: toggleItem(spec.environment, environment) })}
              >
                <span aria-hidden>{ENV_LABEL[environment].icon}</span> {ENV_LABEL[environment].label}
              </Chip>
            ))}
          </div>
          <CustomEnvironmentInput values={spec.customEnvironments} onChange={(customEnvironments) => onChange({ customEnvironments })} />
          <label htmlFor="brief-country" className="mt-4 block text-sm font-medium text-slate-700">
            Your country <span className="font-normal text-slate-500">(optional — for locally available materials and suppliers)</span>
          </label>
          <CountrySelect id="brief-country" className="mt-1 max-w-xs" value={spec.country} onChange={(country) => onChange({ country })} />
        </section>

        <section className="rounded-xl bg-brand-50/60 p-4 ring-1 ring-inset ring-brand-100">
          <h3 className="text-sm font-semibold text-slate-900">Anything else?</h3>
          <p className="mb-2 text-xs text-slate-600">
            Say it in your own words and we’ll update the brief — e.g. “it must survive 600 °C”, “I only have a drill”, “under $20”.
          </p>
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
