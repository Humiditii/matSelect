'use client';

import { useMemo, useState } from 'react';
import { Segmented } from '../ui';
import {
  BeamCase,
  SHAPE_LABEL,
  STRUCTURAL,
  SUPPORT,
  Shape,
  Support,
  conservativeValues,
  formatMm,
  formatNumber,
  formatUsd,
  geometry,
  sizeBeam,
} from './demoPhysics';

const DEFLECTION_RATIOS = [100, 200, 300, 500];
const SAFETY_FACTOR = 1.5;

function Slider({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex justify-between text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="font-semibold tabular-nums text-slate-900">{display}</span>
      </span>
      <input type="range" className="mt-1 w-full accent-brand-600" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

/**
 * Size a beam in six materials at once. Shows the mass of each and the full
 * working for one of them, so the formulas in the text become real numbers.
 */
export function BeamLab() {
  // The load slider is logarithmic: 10^1.5 ≈ 30 N up to 10^4 = 10 kN.
  const [loadExponent, setLoadExponent] = useState(Math.log10(1000));
  const [span, setSpan] = useState(1);
  const [ratio, setRatio] = useState(200);
  const [support, setSupport] = useState<Support>('simply_supported');
  const [shape, setShape] = useState<Shape>('solid_square');
  const [focusId, setFocusId] = useState('aluminium');

  const load = Math.round(10 ** loadExponent);
  const beam: BeamCase = { loadN: load, spanM: span, maxDeflectionM: span / ratio, support, shape, safetyFactor: SAFETY_FACTOR };

  const results = useMemo(() => STRUCTURAL.map((m) => sizeBeam(m, beam)).sort((a, b) => a.massKg - b.massKg), [load, span, ratio, support, shape]); // eslint-disable-line react-hooks/exhaustive-deps
  const heaviest = Math.max(...results.map((r) => r.massKg));
  const focus = results.find((r) => r.material.id === focusId)!;
  const values = conservativeValues(focus.material);
  const g = geometry(shape);
  const { C, k } = SUPPORT[support];

  // The stiffness index for this shape: E^(pA/pI)/ρ.
  const exponentText = shape === 'plank' ? '1/3' : '1/2';
  const exponent = g.pA / g.pI;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Slider label="Load" value={loadExponent} display={`${formatNumber(load)} N (≈ ${formatNumber(load / 9.81, 2)} kg)`} min={1.5} max={4} step={0.01} onChange={setLoadExponent} />
        <Slider label="Span (length)" value={span} display={`${span.toFixed(2)} m`} min={0.2} max={4} step={0.05} onChange={setSpan} />
        <div>
          <p className="mb-1 text-sm font-medium text-slate-700">Allowed bending (deflection)</p>
          <Segmented
            value={String(ratio)}
            onChange={(v) => setRatio(Number(v))}
            options={DEFLECTION_RATIOS.map((r) => ({ value: String(r), label: `span/${r}` }))}
          />
          <p className="mt-1 text-xs text-slate-500">= {formatMm(span / ratio)} mm at most</p>
        </div>
        <div>
          <p className="mb-1 text-sm font-medium text-slate-700">How it is held</p>
          <Segmented
            value={support}
            onChange={setSupport}
            options={[
              { value: 'simply_supported', label: 'Both ends' },
              { value: 'cantilever', label: 'One end' },
            ]}
          />
          <p className="mt-1 text-xs text-slate-500">{SUPPORT[support].label}</p>
        </div>
        <div className="sm:col-span-2">
          <p className="mb-1 text-sm font-medium text-slate-700">Cross-section shape</p>
          <Segmented
            value={shape}
            onChange={setShape}
            options={(Object.keys(SHAPE_LABEL) as Shape[]).map((s) => ({ value: s, label: SHAPE_LABEL[s] }))}
          />
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-slate-900">Mass of the beam in each material (lightest first)</p>
        <ul className="space-y-1.5">
          {results.map((r, i) => (
            <li key={r.material.id}>
              <button
                onClick={() => setFocusId(r.material.id)}
                className={`grid w-full grid-cols-[7.5rem_1fr] items-center gap-2 rounded-lg px-2 py-1 text-left sm:grid-cols-[10rem_1fr] ${r.material.id === focusId ? 'bg-brand-50 ring-1 ring-brand-200' : 'hover:bg-slate-50'}`}
              >
                <span className="truncate text-sm text-slate-800">
                  {i + 1}. {r.material.name}
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-4 rounded-r" style={{ width: `${Math.max(2, (r.massKg / heaviest) * 70)}%`, background: i === 0 ? '#1d5ef1' : '#8ec3ff' }} />
                  <span className="whitespace-nowrap text-xs tabular-nums text-slate-700">
                    {formatNumber(r.massKg)} kg · {r.governing === 'stiffness' ? 'bending limit' : 'strength'}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-slate-500">
          Click a material to see its working. Wood is sized as a solid bar when you pick a tube, because nobody sells thin-walled wooden tubes. Safety factor {SAFETY_FACTOR} on strength.
        </p>
      </div>

      <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700 ring-1 ring-inset ring-slate-200">
        <p className="font-semibold text-slate-900">The working for {focus.material.name}</p>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5">
          <li>
            Conservative values: E = {focus.material.E[0]} GPa (the low end of {focus.material.E[0]}–{focus.material.E[1]}), strength = {focus.material.strength[0]} MPa, density ρ = {formatNumber(values.density)} kg/m³.
          </li>
          <li>
            Stiffness: the beam needs I ≥ F·L³ / ({formatNumber(C)}·E·δ) = {formatNumber(load)} × {span.toFixed(2)}³ / ({formatNumber(C)} × {focus.material.E[0]}×10⁹ × {formatNumber(span / ratio, 3)}) ={' '}
            <strong>{formatNumber(focus.requiredI)} m⁴</strong>, so the size must be at least <strong>{formatMm(focus.sizeForStiffness)} mm</strong>.
          </li>
          <li>
            Strength: the peak bending moment is M = {k === 1 ? '' : '¼·'}F·L = {formatNumber(k * load * span)} N·m. It must stay under the strength divided by {SAFETY_FACTOR}, which needs a size of at least{' '}
            <strong>{formatMm(focus.sizeForStrength)} mm</strong>.
          </li>
          <li>
            The bigger of the two wins: <strong>{formatMm(focus.size)} mm</strong> ({focus.governing === 'stiffness' ? 'bending too much' : 'breaking'} is the real danger here)
            {focus.usedSolid ? ', as a solid round bar' : ''}.
          </li>
          <li>
            Mass = ρ × area × length = {formatNumber(values.density)} × {formatNumber(focus.areaM2 * 1e4)} cm² × {span.toFixed(2)} m = <strong>{formatNumber(focus.massKg)} kg</strong>. That costs about{' '}
            {formatUsd(focus.costUsd)} and about {formatNumber(focus.co2Kg)} kg CO₂e to make.
          </li>
        </ol>
        <p className="mt-3 border-t border-slate-200 pt-3">
          Its stiffness index E<sup>{exponentText}</sup>/ρ = {formatNumber(focus.material.E[0] ** exponent / values.density, 3)}. When bending is the limit, a higher index means a lighter beam, every time.
        </p>
      </div>
    </div>
  );
}
