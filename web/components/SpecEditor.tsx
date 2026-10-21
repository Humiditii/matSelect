'use client';

import {
  AUDIENCE_OPTIONS,
  COMPONENT_LABEL,
  END_LABEL,
  ENV_LABEL,
  FAMILY_LABEL,
  GOAL_OPTIONS,
  MUST_HAVE_LABEL,
  PROCESS_LABEL,
  SAFETY_LABEL,
  SECTION_LABEL,
  SUPPORT_LABEL,
} from '@/lib/labels';
import { isSizedComponent, isTubeSection } from '@/lib/spec';
import {
  COMPONENTS,
  DEFAULT_SAFETY_FACTORS,
  DesignSpec,
  END_CONDITIONS,
  ENVIRONMENTS,
  FAMILIES,
  FORCE_UNITS,
  LENGTH_UNITS,
  MUST_HAVES,
  PROCESSES,
  SAFETY_CLASSES,
  SECTIONS,
  SUPPORTS,
  TORQUE_UNITS,
} from '@/lib/types';
import { CustomEnvironmentInput } from './CustomEnvironmentInput';
import { PenaltyEditor } from './PenaltyEditor';
import { Card, Chip, Field, NumberInput, QuantityInput, Segmented, cx, inputClass, toggleItem } from './ui';

type SpecChange = (patch: Partial<DesignSpec>) => void;

const choiceButtonClass = (selected: boolean) =>
  cx(
    'ring-1 ring-inset transition',
    selected ? 'bg-brand-50 ring-2 ring-brand-500' : 'bg-white ring-slate-200 hover:ring-slate-300',
  );

function WhatItIsCard({ spec, onChange }: { spec: DesignSpec; onChange: SpecChange }) {
  return (
    <Card title={<span>1 · What it is</span>} subtitle="The single most critical part, simplified so it can be calculated.">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Name">
          <input className={inputClass} value={spec.title} maxLength={120} onChange={(e) => onChange({ title: e.target.value })} />
        </Field>
        <Field label="Explain the result for">
          <Segmented value={spec.audience} onChange={(audience) => onChange({ audience })} options={AUDIENCE_OPTIONS} />
        </Field>
      </div>

      <p className="mb-2 mt-5 text-sm font-medium text-slate-700">How is it loaded?</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {COMPONENTS.map((component) => (
          <button
            key={component}
            type="button"
            aria-pressed={spec.component === component}
            onClick={() => onChange({ component })}
            className={cx('flex items-start gap-2 rounded-xl p-3 text-left', choiceButtonClass(spec.component === component))}
          >
            <span aria-hidden className="text-lg leading-6">
              {COMPONENT_LABEL[component].icon}
            </span>
            <span>
              <span className="block text-sm font-semibold text-slate-900">{COMPONENT_LABEL[component].label}</span>
              <span className="block text-xs text-slate-500">{COMPONENT_LABEL[component].hint}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Field label="Goal">
          <Segmented value={spec.objective} onChange={(objective) => onChange({ objective })} options={GOAL_OPTIONS} />
          {spec.objective === 'balanced' && <PenaltyEditor value={spec.penalty} onChange={(penalty) => onChange({ penalty })} />}
        </Field>
        {spec.component !== 'custom' && (
          <Field label="It must…" hint={spec.criteria.length === 0 ? 'Choose at least one.' : undefined}>
            <div className="flex flex-wrap gap-2">
              <Chip
                active={spec.criteria.includes('stiffness')}
                onClick={() => onChange({ criteria: toggleItem(spec.criteria, 'stiffness') })}
              >
                not bend too much
              </Chip>
              <Chip
                active={spec.criteria.includes('strength')}
                onClick={() => onChange({ criteria: toggleItem(spec.criteria, 'strength') })}
              >
                not break
              </Chip>
            </div>
          </Field>
        )}
      </div>
    </Card>
  );
}

/** The third field in the loads row, which depends on how the part is loaded. */
function DeflectionField({ spec, onChange }: { spec: DesignSpec; onChange: SpecChange }) {
  if (spec.component === 'shaft') {
    return (
      <Field label="Max twist (degrees)" hint="Leave empty to check strength only">
        <NumberInput
          ariaLabel="Max twist"
          value={spec.maxTwistDeg}
          min={0}
          onChange={(maxTwistDeg) => onChange({ maxTwistDeg })}
          placeholder="e.g. 2"
        />
      </Field>
    );
  }
  if (spec.component === 'column') {
    return <div className="text-xs text-slate-500 md:pt-7">Columns are always checked for buckling and crushing.</div>;
  }
  return (
    <Field
      label={spec.component === 'tie' ? 'Max stretch' : 'Max bending (sag)'}
      hint={spec.criteria.includes('stiffness') ? 'Needed to size for stiffness' : 'Only used for “not bend too much”'}
    >
      <QuantityInput
        ariaLabel="Max deflection"
        value={spec.maxDeflection}
        onChange={(maxDeflection) => onChange({ maxDeflection })}
        units={LENGTH_UNITS}
        defaultUnit="mm"
        placeholder="e.g. 5"
      />
    </Field>
  );
}

function LoadsAndSizeCard({ spec, onChange }: { spec: DesignSpec; onChange: SpecChange }) {
  const isShaft = spec.component === 'shaft';
  // A shaft can only have a round section.
  const sections = isShaft ? SECTIONS.filter((section) => section === 'solid_round' || section === 'round_tube') : SECTIONS;

  return (
    <Card
      title="2 · Loads and size"
      subtitle="Give the load and the length to get the actual part size, mass and cost. Without them, materials are ranked by a performance index."
    >
      <div className="grid gap-4 md:grid-cols-3">
        <Field label={isShaft ? 'Torque' : 'Load'} hint={isShaft ? 'Twisting moment' : 'kg means the weight of that mass'}>
          <QuantityInput
            ariaLabel="Load"
            value={spec.load}
            onChange={(load) => onChange({ load })}
            units={isShaft ? TORQUE_UNITS : FORCE_UNITS}
            defaultUnit={isShaft ? 'N·m' : 'kg'}
            placeholder="e.g. 100"
          />
        </Field>
        <Field label={spec.component === 'beam' ? 'Span (between supports)' : 'Length'}>
          <QuantityInput
            ariaLabel="Length"
            value={spec.length}
            onChange={(length) => onChange({ length })}
            units={LENGTH_UNITS}
            defaultUnit="m"
            placeholder="e.g. 1.2"
          />
        </Field>
        <DeflectionField spec={spec} onChange={onChange} />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {spec.component === 'beam' && (
          <Field label="How is it supported?">
            <select
              className={inputClass}
              value={spec.support}
              onChange={(e) => onChange({ support: e.target.value as DesignSpec['support'] })}
            >
              {SUPPORTS.map((support) => (
                <option key={support} value={support}>
                  {SUPPORT_LABEL[support]}
                </option>
              ))}
            </select>
          </Field>
        )}
        {spec.component === 'column' && (
          <Field label="How are the ends held?">
            <select
              className={inputClass}
              value={spec.endCondition}
              onChange={(e) => onChange({ endCondition: e.target.value as DesignSpec['endCondition'] })}
            >
              {END_CONDITIONS.map((endCondition) => (
                <option key={endCondition} value={endCondition}>
                  {END_LABEL[endCondition]}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>

      <p className="mb-2 mt-4 text-sm font-medium text-slate-700">Cross-section shape</p>
      <div className="flex flex-wrap gap-2">
        {sections.map((section) => (
          <Chip key={section} active={spec.section === section} onClick={() => onChange({ section })}>
            <span aria-hidden className="font-mono">
              {SECTION_LABEL[section].icon}
            </span>{' '}
            {SECTION_LABEL[section].label}
          </Chip>
        ))}
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {spec.section === 'rect_fixed_width' && (
          <Field label="Board width" hint="Thickness is what gets calculated">
            <QuantityInput
              ariaLabel="Board width"
              value={spec.sectionWidth}
              onChange={(sectionWidth) => onChange({ sectionWidth })}
              units={LENGTH_UNITS}
              defaultUnit="mm"
              placeholder="e.g. 250"
            />
          </Field>
        )}
        {isTubeSection(spec.section) && (
          <Field label="Tube outer size ÷ wall" hint="15 is a typical tube; higher = thinner wall">
            <NumberInput ariaLabel="Tube ratio" value={spec.tubeRatio} min={2.5} onChange={(ratio) => onChange({ tubeRatio: ratio ?? 15 })} />
          </Field>
        )}
      </div>
    </Card>
  );
}

const positiveOrNull = (value: number | null) => (value && value > 0 ? value : null);

function UseAndMakingCard({ spec, onChange, number }: { spec: DesignSpec; onChange: SpecChange; number: number }) {
  const [coldest, hottest] = spec.tempRangeC ?? [null, null];

  // An empty side defaults to room temperature (20 °C), kept on the right side of the other bound.
  const setTemperatureRange = (low: number | null, high: number | null) => {
    if (low === null && high === null) return onChange({ tempRangeC: null });
    onChange({ tempRangeC: [low ?? Math.min(20, high!), high ?? Math.max(20, low!)] });
  };

  const toggleExcludedFamily = (family: (typeof FAMILIES)[number]) => {
    const next = toggleItem(spec.excludeFamilies, family);
    // At least one family has to stay in.
    if (next.length < FAMILIES.length) onChange({ excludeFamilies: next });
  };

  return (
    <Card title={`${number} · Use and making`} subtitle="Where it lives, how you will make it, and what it must cost.">
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Where will it be used?</p>
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
          {spec.customEnvironments.length > 0 && (
            <p className="mt-1 text-xs text-slate-500">
              Every candidate material is rated for your own conditions and must score “good” (B) or better. In demo mode they are matched
              to the closest listed condition instead.
            </p>
          )}
        </div>
        <div>
          <p className="mb-1 text-sm font-medium text-slate-700">Which processes will the part need?</p>
          <p className="mb-2 text-xs text-slate-500">Every one you pick must work on the material. Leave all off if a supplier will make it.</p>
          <div className="flex flex-wrap gap-2">
            {PROCESSES.map((process) => (
              <Chip
                key={process}
                active={spec.requiredProcesses.includes(process)}
                onClick={() => onChange({ requiredProcesses: toggleItem(spec.requiredProcesses, process) })}
              >
                {PROCESS_LABEL[process]}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Must be…</p>
          <div className="flex flex-wrap gap-2">
            {MUST_HAVES.map((mustHave) => (
              <Chip
                key={mustHave}
                active={spec.mustHave.includes(mustHave)}
                onClick={() => onChange({ mustHave: toggleItem(spec.mustHave, mustHave) })}
              >
                {MUST_HAVE_LABEL[mustHave]}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Don’t consider</p>
          <div className="flex flex-wrap gap-2">
            {FAMILIES.map((family) => (
              <Chip key={family} tone="rose" active={spec.excludeFamilies.includes(family)} onClick={() => toggleExcludedFamily(family)}>
                <span aria-hidden>{FAMILY_LABEL[family].icon}</span> {FAMILY_LABEL[family].label}
              </Chip>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Coldest (°C)" hint="Empty side = room temperature">
            <NumberInput
              ariaLabel="Minimum temperature"
              value={coldest}
              placeholder="—"
              onChange={(value) => setTemperatureRange(value, hottest)}
            />
          </Field>
          <Field label="Hottest (°C)">
            <NumberInput
              ariaLabel="Maximum temperature"
              value={hottest}
              placeholder="—"
              onChange={(value) => setTemperatureRange(coldest, value)}
            />
          </Field>
          <Field label="Max price (USD/kg)">
            <NumberInput
              ariaLabel="Max price per kg"
              value={spec.maxPricePerKg}
              min={0}
              placeholder="No limit"
              onChange={(value) => onChange({ maxPricePerKg: positiveOrNull(value) })}
            />
          </Field>
          <Field label="Budget per part (USD)" hint={isSizedComponent(spec.component) ? undefined : 'Needs load and length'}>
            <NumberInput
              ariaLabel="Budget per part"
              value={spec.budgetPerPart}
              min={0}
              placeholder="No limit"
              onChange={(value) => onChange({ budgetPerPart: positiveOrNull(value) })}
            />
          </Field>
        </div>
        {spec.tempRangeC && (
          <button
            type="button"
            className="text-xs font-medium text-slate-500 underline hover:text-slate-700"
            onClick={() => onChange({ tempRangeC: null })}
          >
            Clear temperature range
          </button>
        )}
      </div>
    </Card>
  );
}

function SafetyCard({ spec, onChange, number }: { spec: DesignSpec; onChange: SpecChange; number: number }) {
  const defaultFactor = DEFAULT_SAFETY_FACTORS[spec.safetyClass];
  const isBelowDefault = spec.safetyFactor !== null && spec.safetyFactor < defaultFactor;
  const isBelowOne = spec.safetyFactor !== null && spec.safetyFactor < 1;

  return (
    <Card title={`${number} · Safety`} subtitle="Parts that carry people or lift loads get a bigger safety margin.">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="What happens if it fails?">
          <div className="grid gap-2">
            {SAFETY_CLASSES.map((safetyClass) => (
              <button
                key={safetyClass}
                type="button"
                aria-pressed={spec.safetyClass === safetyClass}
                onClick={() => onChange({ safetyClass })}
                className={cx(
                  'flex items-center justify-between rounded-xl px-3 py-2 text-left',
                  choiceButtonClass(spec.safetyClass === safetyClass),
                )}
              >
                <span>
                  <span className="block text-sm font-semibold text-slate-900">{SAFETY_LABEL[safetyClass].label}</span>
                  <span className="block text-xs text-slate-500">{SAFETY_LABEL[safetyClass].hint}</span>
                </span>
                <span className="text-xs font-medium text-slate-500">× {DEFAULT_SAFETY_FACTORS[safetyClass]}</span>
              </button>
            ))}
          </div>
        </Field>
        <Field
          label="Safety factor"
          hint={`Leave empty to use the default ${defaultFactor} for “${SAFETY_LABEL[spec.safetyClass].label}”.`}
        >
          <NumberInput
            ariaLabel="Safety factor"
            value={spec.safetyFactor}
            min={1}
            placeholder={`${defaultFactor} (default)`}
            onChange={(safetyFactor) => onChange({ safetyFactor })}
          />
          {isBelowDefault && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
              ⚠️ Lower than the usual {defaultFactor} for this use — the part will be thinner and closer to failure.
            </p>
          )}
          {isBelowOne && <p className="mt-2 text-xs text-rose-700">The safety factor must be at least 1.</p>}
        </Field>
      </div>
    </Card>
  );
}

/** Every field of the spec, shown under "Fine-tune every detail". */
export function SpecEditor({ spec, onChange }: { spec: DesignSpec; onChange: SpecChange }) {
  const isSized = isSizedComponent(spec.component);
  // The loads card only shows for sized parts, so the later cards are numbered after it.
  const nextNumber = isSized ? 3 : 2;

  return (
    <div className="space-y-4">
      <WhatItIsCard spec={spec} onChange={onChange} />
      {isSized && <LoadsAndSizeCard spec={spec} onChange={onChange} />}
      <UseAndMakingCard spec={spec} onChange={onChange} number={nextNumber} />
      <SafetyCard spec={spec} onChange={onChange} number={nextNumber + 1} />
    </div>
  );
}
