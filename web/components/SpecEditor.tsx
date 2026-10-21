'use client';

import { useState } from 'react';
import {
  AUDIENCE_LABEL,
  COMPONENT_LABEL,
  END_LABEL,
  ENV_LABEL,
  FAMILY_LABEL,
  MUST_HAVE_LABEL,
  PROCESS_LABEL,
  SAFETY_LABEL,
  SECTION_LABEL,
  SUPPORT_LABEL,
} from '@/lib/labels';
import {
  AUDIENCES,
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
import { PenaltyEditor } from './PenaltyEditor';
import { Button, Card, Chip, Field, NumberInput, QuantityInput, Segmented, cx, inputClass } from './ui';

export const MAX_CUSTOM_ENVIRONMENTS = 5;

/** Add a condition that isn't in the list, in the user's own words. */
export function CustomEnvInput({ values, onChange, compact }: { values: string[]; onChange: (v: string[]) => void; compact?: boolean }) {
  const [text, setText] = useState('');
  const v = text.trim();
  const full = values.length >= MAX_CUSTOM_ENVIRONMENTS;
  const add = () => {
    if (v.length < 2 || full) return;
    if (!values.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...values, v.slice(0, 80)]);
    setText('');
  };
  return (
    <div className={compact ? 'mt-3' : 'mt-3 space-y-2'}>
      {!compact && values.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {values.map((x) => (
            <span key={x} className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 py-1.5 pl-3 pr-1.5 text-sm font-medium text-brand-700 ring-1 ring-inset ring-brand-300">
              ✓ {x}
              <button
                type="button"
                aria-label={`Remove ${x}`}
                className="grid h-5 w-5 place-items-center rounded-full text-brand-500 hover:bg-brand-100 hover:text-brand-800"
                onClick={() => onChange(values.filter((y) => y !== x))}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex max-w-lg gap-2">
        <input
          className={inputClass}
          value={text}
          maxLength={80}
          disabled={full}
          aria-label="Add your own environment"
          placeholder={full ? `Up to ${MAX_CUSTOM_ENVIRONMENTS} of your own` : compact ? 'Other — type your own…' : 'Something else? e.g. next to a swimming pool'}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button variant="secondary" onClick={add} disabled={v.length < 2 || full}>
          Add
        </Button>
      </div>
    </div>
  );
}

const SIZED = ['beam', 'tie', 'column', 'shaft'];

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export function SpecEditor({ spec, onChange }: { spec: DesignSpec; onChange: (patch: Partial<DesignSpec>) => void }) {
  const sized = SIZED.includes(spec.component);
  const defaultSf = DEFAULT_SAFETY_FACTORS[spec.safetyClass];
  const sfLow = spec.safetyFactor !== null && spec.safetyFactor < defaultSf;
  const isTube = spec.section === 'round_tube' || spec.section === 'square_tube';
  // A missing bound defaults to room temperature (20 °C), clamped so min ≤ max.
  const setTemp = (lo: number | null, hi: number | null) =>
    onChange({ tempRangeC: lo === null && hi === null ? null : [lo ?? Math.min(20, hi!), hi ?? Math.max(20, lo!)] });

  return (
    <div className="space-y-4">
      {/* -------------------------------------------------- What it is */}
      <Card title={<span>1 · What it is</span>} subtitle="The single most critical part, simplified so it can be calculated.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Name">
            <input className={inputClass} value={spec.title} maxLength={120} onChange={(e) => onChange({ title: e.target.value })} />
          </Field>
          <Field label="Explain the result for">
            <Segmented
              value={spec.audience}
              onChange={(audience) => onChange({ audience })}
              options={AUDIENCES.map((a) => ({ value: a, label: `${AUDIENCE_LABEL[a].icon} ${AUDIENCE_LABEL[a].label}`, title: AUDIENCE_LABEL[a].hint }))}
            />
          </Field>
        </div>

        <p className="mb-2 mt-5 text-sm font-medium text-slate-700">How is it loaded?</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {COMPONENTS.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={spec.component === c}
              onClick={() => onChange({ component: c })}
              className={cx(
                'flex items-start gap-2 rounded-xl p-3 text-left ring-1 ring-inset transition',
                spec.component === c ? 'bg-brand-50 ring-2 ring-brand-500' : 'bg-white ring-slate-200 hover:ring-slate-300',
              )}
            >
              <span aria-hidden className="text-lg leading-6">{COMPONENT_LABEL[c].icon}</span>
              <span>
                <span className="block text-sm font-semibold text-slate-900">{COMPONENT_LABEL[c].label}</span>
                <span className="block text-xs text-slate-500">{COMPONENT_LABEL[c].hint}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Goal">
            <Segmented
              value={spec.objective}
              onChange={(objective) => onChange({ objective })}
              options={[
                { value: 'min_mass', label: '🪶 As light as possible' },
                { value: 'min_cost', label: '💲 As cheap as possible' },
                { value: 'min_carbon', label: '🌱 Lowest carbon' },
                { value: 'balanced', label: '⚖️ Balanced' },
              ]}
            />
            {spec.objective === 'balanced' && <PenaltyEditor value={spec.penalty} onChange={(penalty) => onChange({ penalty })} />}
          </Field>
          {spec.component !== 'custom' && (
          <Field label="It must…" hint={spec.criteria.length === 0 ? 'Choose at least one.' : undefined}>
            <div className="flex flex-wrap gap-2">
              <Chip active={spec.criteria.includes('stiffness')} onClick={() => onChange({ criteria: toggle(spec.criteria, 'stiffness') })}>
                not bend too much
              </Chip>
              <Chip active={spec.criteria.includes('strength')} onClick={() => onChange({ criteria: toggle(spec.criteria, 'strength') })}>
                not break
              </Chip>
            </div>
          </Field>
          )}
        </div>
      </Card>

      {/* -------------------------------------------------- Loads and size */}
      {sized && (
        <Card
          title="2 · Loads and size"
          subtitle="Give the load and the length to get the actual part size, mass and cost. Without them, materials are ranked by a performance index."
        >
          <div className="grid gap-4 md:grid-cols-3">
            <Field label={spec.component === 'shaft' ? 'Torque' : 'Load'} hint={spec.component === 'shaft' ? 'Twisting moment' : 'kg means the weight of that mass'}>
              <QuantityInput
                ariaLabel="Load"
                value={spec.load}
                onChange={(load) => onChange({ load })}
                units={spec.component === 'shaft' ? TORQUE_UNITS : FORCE_UNITS}
                defaultUnit={spec.component === 'shaft' ? 'N·m' : 'kg'}
                placeholder="e.g. 100"
              />
            </Field>
            <Field label={spec.component === 'beam' ? 'Span (between supports)' : 'Length'}>
              <QuantityInput ariaLabel="Length" value={spec.length} onChange={(length) => onChange({ length })} units={LENGTH_UNITS} defaultUnit="m" placeholder="e.g. 1.2" />
            </Field>
            {spec.component === 'shaft' ? (
              <Field label="Max twist (degrees)" hint="Leave empty to check strength only">
                <NumberInput ariaLabel="Max twist" value={spec.maxTwistDeg} min={0} onChange={(maxTwistDeg) => onChange({ maxTwistDeg })} placeholder="e.g. 2" />
              </Field>
            ) : spec.component !== 'column' ? (
              <Field label={spec.component === 'tie' ? 'Max stretch' : 'Max bending (sag)'} hint={spec.criteria.includes('stiffness') ? 'Needed to size for stiffness' : 'Only used for “not bend too much”'}>
                <QuantityInput ariaLabel="Max deflection" value={spec.maxDeflection} onChange={(maxDeflection) => onChange({ maxDeflection })} units={LENGTH_UNITS} defaultUnit="mm" placeholder="e.g. 5" />
              </Field>
            ) : (
              <div className="text-xs text-slate-500 md:pt-7">Columns are always checked for buckling and crushing.</div>
            )}
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {spec.component === 'beam' && (
              <Field label="How is it supported?">
                <select className={inputClass} value={spec.support} onChange={(e) => onChange({ support: e.target.value as DesignSpec['support'] })}>
                  {SUPPORTS.map((s) => (
                    <option key={s} value={s}>
                      {SUPPORT_LABEL[s]}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {spec.component === 'column' && (
              <Field label="How are the ends held?">
                <select className={inputClass} value={spec.endCondition} onChange={(e) => onChange({ endCondition: e.target.value as DesignSpec['endCondition'] })}>
                  {END_CONDITIONS.map((s) => (
                    <option key={s} value={s}>
                      {END_LABEL[s]}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>

          <p className="mb-2 mt-4 text-sm font-medium text-slate-700">Cross-section shape</p>
          <div className="flex flex-wrap gap-2">
            {SECTIONS.filter((s) => spec.component !== 'shaft' || s === 'solid_round' || s === 'round_tube').map((s) => (
              <Chip key={s} active={spec.section === s} onClick={() => onChange({ section: s })}>
                <span aria-hidden className="font-mono">{SECTION_LABEL[s].icon}</span> {SECTION_LABEL[s].label}
              </Chip>
            ))}
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {spec.section === 'rect_fixed_width' && (
              <Field label="Board width" hint="Thickness is what gets calculated">
                <QuantityInput ariaLabel="Board width" value={spec.sectionWidth} onChange={(sectionWidth) => onChange({ sectionWidth })} units={LENGTH_UNITS} defaultUnit="mm" placeholder="e.g. 250" />
              </Field>
            )}
            {isTube && (
              <Field label="Tube outer size ÷ wall" hint="15 is a typical tube; higher = thinner wall">
                <NumberInput ariaLabel="Tube ratio" value={spec.tubeRatio} min={2.5} onChange={(v) => onChange({ tubeRatio: v ?? 15 })} />
              </Field>
            )}
          </div>
        </Card>
      )}

      {/* -------------------------------------------------- Use and making */}
      <Card title={`${sized ? 3 : 2} · Use and making`} subtitle="Where it lives, how you will make it, and what it must cost.">
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Where will it be used?</p>
            <div className="flex flex-wrap gap-2">
              {ENVIRONMENTS.map((e) => (
                <Chip key={e} active={spec.environment.includes(e)} onClick={() => onChange({ environment: toggle(spec.environment, e) })}>
                  <span aria-hidden>{ENV_LABEL[e].icon}</span> {ENV_LABEL[e].label}
                </Chip>
              ))}
            </div>
            <CustomEnvInput values={spec.customEnvironments} onChange={(customEnvironments) => onChange({ customEnvironments })} />
            {spec.customEnvironments.length > 0 && (
              <p className="mt-1 text-xs text-slate-500">
                Every candidate material is rated for your own conditions and must score “good” (B) or better. In demo mode they are matched to the closest listed condition instead.
              </p>
            )}
          </div>
          <div>
            <p className="mb-1 text-sm font-medium text-slate-700">Which processes will the part need?</p>
            <p className="mb-2 text-xs text-slate-500">Every one you pick must work on the material. Leave all off if a supplier will make it.</p>
            <div className="flex flex-wrap gap-2">
              {PROCESSES.map((p) => (
                <Chip key={p} active={spec.requiredProcesses.includes(p)} onClick={() => onChange({ requiredProcesses: toggle(spec.requiredProcesses, p) })}>
                  {PROCESS_LABEL[p]}
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Must be…</p>
            <div className="flex flex-wrap gap-2">
              {MUST_HAVES.map((m) => (
                <Chip key={m} active={spec.mustHave.includes(m)} onClick={() => onChange({ mustHave: toggle(spec.mustHave, m) })}>
                  {MUST_HAVE_LABEL[m]}
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Don’t consider</p>
            <div className="flex flex-wrap gap-2">
              {FAMILIES.map((f) => (
                <Chip
                  key={f}
                  tone="rose"
                  active={spec.excludeFamilies.includes(f)}
                  onClick={() => {
                    const next = toggle(spec.excludeFamilies, f);
                    if (next.length < FAMILIES.length) onChange({ excludeFamilies: next });
                  }}
                >
                  <span aria-hidden>{FAMILY_LABEL[f].icon}</span> {FAMILY_LABEL[f].label}
                </Chip>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Coldest (°C)" hint="Empty side = room temperature">
              <NumberInput ariaLabel="Minimum temperature" value={spec.tempRangeC?.[0] ?? null} placeholder="—" onChange={(v) => setTemp(v, spec.tempRangeC?.[1] ?? null)} />
            </Field>
            <Field label="Hottest (°C)">
              <NumberInput ariaLabel="Maximum temperature" value={spec.tempRangeC?.[1] ?? null} placeholder="—" onChange={(v) => setTemp(spec.tempRangeC?.[0] ?? null, v)} />
            </Field>
            <Field label="Max price (USD/kg)">
              <NumberInput ariaLabel="Max price per kg" value={spec.maxPricePerKg} min={0} placeholder="No limit" onChange={(v) => onChange({ maxPricePerKg: v && v > 0 ? v : null })} />
            </Field>
            <Field label="Budget per part (USD)" hint={sized ? undefined : 'Needs load and length'}>
              <NumberInput ariaLabel="Budget per part" value={spec.budgetPerPart} min={0} placeholder="No limit" onChange={(v) => onChange({ budgetPerPart: v && v > 0 ? v : null })} />
            </Field>
          </div>
          {spec.tempRangeC && (
            <button type="button" className="text-xs font-medium text-slate-500 underline hover:text-slate-700" onClick={() => onChange({ tempRangeC: null })}>
              Clear temperature range
            </button>
          )}
        </div>
      </Card>

      {/* -------------------------------------------------- Safety */}
      <Card title={`${sized ? 4 : 3} · Safety`} subtitle="Parts that carry people or lift loads get a bigger safety margin.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="What happens if it fails?">
            <div className="grid gap-2">
              {SAFETY_CLASSES.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={spec.safetyClass === c}
                  onClick={() => onChange({ safetyClass: c })}
                  className={cx(
                    'flex items-center justify-between rounded-xl px-3 py-2 text-left ring-1 ring-inset transition',
                    spec.safetyClass === c ? 'bg-brand-50 ring-2 ring-brand-500' : 'bg-white ring-slate-200 hover:ring-slate-300',
                  )}
                >
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">{SAFETY_LABEL[c].label}</span>
                    <span className="block text-xs text-slate-500">{SAFETY_LABEL[c].hint}</span>
                  </span>
                  <span className="text-xs font-medium text-slate-500">× {DEFAULT_SAFETY_FACTORS[c]}</span>
                </button>
              ))}
            </div>
          </Field>
          <Field label="Safety factor" hint={`Leave empty to use the default ${defaultSf} for “${SAFETY_LABEL[spec.safetyClass].label}”.`}>
            <NumberInput ariaLabel="Safety factor" value={spec.safetyFactor} min={1} placeholder={`${defaultSf} (default)`} onChange={(v) => onChange({ safetyFactor: v })} />
            {sfLow && (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
                ⚠️ Lower than the usual {defaultSf} for this use — the part will be thinner and closer to failure.
              </p>
            )}
            {spec.safetyFactor !== null && spec.safetyFactor < 1 && <p className="mt-2 text-xs text-rose-700">The safety factor must be at least 1.</p>}
          </Field>
        </div>
      </Card>
    </div>
  );
}
