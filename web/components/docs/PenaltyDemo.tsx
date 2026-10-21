'use client';

import { useMemo, useState } from 'react';
import { Chip } from '../ui';
import { logTicks, useContainerWidth } from '../charts/chartHelpers';
import { BeamCase, STRUCTURAL, formatNumber, formatUsd, sizeBeam } from './demoPhysics';
import { placeLabels } from './labelPlacement';

// Rounded so the server and browser render identical SVG coordinates.
const round1 = (x: number) => Math.round(x * 10) / 10;

// A 50 cm arm sticking out of a wall, holding about 20 kg at its tip without sagging more than 2.5 mm.
const ARM: BeamCase = { loadN: 200, spanM: 0.5, maxDeflectionM: 0.0025, support: 'cantilever', shape: 'round_tube', safetyFactor: 1.5 };

const PART_COLORS = { material: '#1d5ef1', mass: '#e07b00', carbon: '#0f9488' };

const MASS_PRESETS = [
  { label: '$0 (cost only)', value: 0 },
  { label: '$1 furniture', value: 1 },
  { label: '$10 bicycle', value: 10 },
  { label: '$100 drone', value: 100 },
  { label: '$1000 aircraft', value: 1000 },
];

// The mass slider runs on a log scale; position 0 means "weight is worth nothing".
const sliderToAlpha = (position: number) => (position <= 0 ? 0 : 10 ** (position - 2));
const alphaToSlider = (alpha: number) => (alpha <= 0 ? 0 : Math.log10(alpha) + 2);

export function PenaltyDemo() {
  const [alphaMass, setAlphaMass] = useState(1);
  const [carbonPrice, setCarbonPrice] = useState(100); // USD per tonne
  const alphaCo2 = carbonPrice / 1000;
  const { containerRef, width } = useContainerWidth();

  const parts = useMemo(() => STRUCTURAL.map((m) => sizeBeam(m, ARM)), []);
  const scored = parts
    .map((p) => {
      const material = p.costUsd;
      const mass = alphaMass * p.massKg;
      const carbon = alphaCo2 * p.co2Kg;
      return { part: p, material, mass, carbon, z: material + mass + carbon };
    })
    .sort((a, b) => a.z - b.z);
  const largest = scored[scored.length - 1].z;
  const winner = scored[0];

  // Trade-off chart: mass against cost, log-log.
  const margin = { left: 58, right: 14, top: 10, bottom: 36 };
  const height = 260;
  const masses = parts.map((p) => p.massKg);
  const costs = parts.map((p) => p.costUsd);
  const xAxis = logTicks(Math.min(...masses) / 1.5, Math.max(...masses) * 1.5);
  const yAxis = logTicks(Math.min(...costs) / 1.5, Math.max(...costs) * 1.5);
  const toX = (v: number) =>
    round1(margin.left + (Math.log10(v / xAxis.low) / Math.log10(xAxis.high / xAxis.low)) * (width - margin.left - margin.right));
  const toY = (v: number) =>
    round1(height - margin.bottom - (Math.log10(v / yAxis.low) / Math.log10(yAxis.high / yAxis.low)) * (height - margin.top - margin.bottom));
  const onFront = (p: (typeof parts)[number]) => !parts.some((q) => q !== p && q.massKg <= p.massKg && q.costUsd <= p.costUsd);

  const labels = placeLabels(
    parts.map((p) => ({ cx: toX(p.massKg), cy: toY(p.costUsd), w: 22, h: 22, label: p.material.name })),
    { x: margin.left, y: margin.top, w: width - margin.left - margin.right, h: height - margin.top - margin.bottom },
  );

  // Line of equal (cost + α_m·mass) through the winner: cost = Z − α_m·mass.
  const zLine = winner.part.costUsd + alphaMass * winner.part.massKg;
  const linePoints: string[] = [];
  for (let i = 0; i <= 60; i++) {
    const m = xAxis.low * (xAxis.high / xAxis.low) ** (i / 60);
    const c = zLine - alphaMass * m;
    if (c >= yAxis.low && c <= yAxis.high) linePoints.push(`${toX(m).toFixed(1)},${toY(c).toFixed(1)}`);
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block">
            <span className="flex justify-between text-sm">
              <span className="font-medium text-slate-700">
                Value of 1 kg saved, α<sub>m</sub>
              </span>
              <span className="font-semibold tabular-nums text-slate-900">${formatNumber(alphaMass)} / kg</span>
            </span>
            <input
              type="range"
              className="mt-1 w-full accent-brand-600"
              min={0}
              max={5}
              step={0.05}
              value={alphaToSlider(alphaMass)}
              onChange={(e) => setAlphaMass(Number(sliderToAlpha(Number(e.target.value)).toPrecision(2)))}
            />
          </label>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {MASS_PRESETS.map((preset) => (
              <Chip key={preset.label} active={alphaMass === preset.value} onClick={() => setAlphaMass(preset.value)}>
                {preset.label}
              </Chip>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="flex justify-between text-sm">
            <span className="font-medium text-slate-700">
              Carbon price, α<sub>CO₂</sub>
            </span>
            <span className="font-semibold tabular-nums text-slate-900">${carbonPrice} / tonne</span>
          </span>
          <input type="range" className="mt-1 w-full accent-brand-600" min={0} max={500} step={10} value={carbonPrice} onChange={(e) => setCarbonPrice(Number(e.target.value))} />
          <span className="mt-1 block text-xs text-slate-500">= ${formatNumber(alphaCo2)} per kg of CO₂e</span>
        </label>
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
          <span className="font-semibold text-slate-900">Penalty Z of the arm, lowest first:</span>
          {(
            [
              ['material', 'material cost'],
              ['mass', 'value of its mass'],
              ['carbon', 'value of its carbon'],
            ] as const
          ).map(([key, label]) => (
            <span key={key} className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm" style={{ background: PART_COLORS[key] }} />
              {label}
            </span>
          ))}
        </div>
        <ul className="space-y-1.5">
          {scored.map((row, i) => (
            <li key={row.part.material.id} className="grid grid-cols-[7.5rem_1fr] items-center gap-2 text-sm sm:grid-cols-[10rem_1fr]">
              <span className={`truncate ${i === 0 ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>
                {i === 0 ? '🏆 ' : `${i + 1}. `}
                {row.part.material.name}
              </span>
              <span className="flex items-center gap-2">
                <span className="flex h-4 gap-0.5" style={{ width: `${Math.max(3, (row.z / largest) * 72)}%` }}>
                  {(['material', 'mass', 'carbon'] as const).map((key) =>
                    row[key] > 0 ? <span key={key} className="h-full first:rounded-l last:rounded-r" style={{ flexGrow: row[key], background: PART_COLORS[key] }} title={`${key}: ${formatUsd(row[key])}`} /> : null,
                  )}
                </span>
                <span className="whitespace-nowrap text-xs tabular-nums text-slate-700">{formatUsd(row.z)}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-sm text-slate-700">
          Winner: <strong>{winner.part.material.name}</strong>, Z = {formatUsd(winner.material)} material + {formatUsd(winner.mass)} for its {formatNumber(winner.part.massKg)} kg + {formatUsd(winner.carbon)} for its{' '}
          {formatNumber(winner.part.co2Kg)} kg CO₂e = <strong>{formatUsd(winner.z)}</strong>.
        </p>
      </div>

      <div ref={containerRef}>
        <p className="mb-1 text-sm font-semibold text-slate-900">The same arm on a trade-off chart</p>
        <svg width={width} height={height} role="img" aria-label="Mass against material cost for the arm in each material" className="block">
          {xAxis.ticks.map((t) => (
            <g key={`x${t}`}>
              <line x1={toX(t)} x2={toX(t)} y1={margin.top} y2={height - margin.bottom} stroke="#e2e8f0" />
              <text x={toX(t)} y={height - margin.bottom + 14} textAnchor="middle" fontSize={11} fill="#64748b">
                {formatNumber(t)}
              </text>
            </g>
          ))}
          {yAxis.ticks.map((t) => (
            <g key={`y${t}`}>
              <line x1={margin.left} x2={width - margin.right} y1={toY(t)} y2={toY(t)} stroke="#e2e8f0" />
              <text x={margin.left - 6} y={toY(t) + 4} textAnchor="end" fontSize={11} fill="#64748b">
                ${formatNumber(t)}
              </text>
            </g>
          ))}
          <text x={(margin.left + width - margin.right) / 2} y={height - 4} textAnchor="middle" fontSize={12} fill="#334155">
            Mass of the arm (kg) →
          </text>
          <text transform={`translate(11 ${(margin.top + height - margin.bottom) / 2}) rotate(-90)`} textAnchor="middle" fontSize={12} fill="#334155">
            Material cost →
          </text>
          {linePoints.length > 1 && <polyline points={linePoints.join(' ')} fill="none" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 4" />}
          {parts.map((p) => {
            const front = onFront(p);
            const isWinner = p === winner.part;
            const x = toX(p.massKg);
            const y = toY(p.costUsd);
            return (
              <g key={p.material.id}>
                {isWinner && <circle cx={x} cy={y} r={11} fill="none" stroke="#1d5ef1" strokeWidth={1.5} />}
                <circle cx={x} cy={y} r={6} fill={front ? '#1d5ef1' : '#94a3b8'} stroke="#fff" strokeWidth={2} />
              </g>
            );
          })}
          {parts.map((p, i) => (
            <text key={`label-${p.material.id}`} x={labels[i].x + 2} y={labels[i].y + 10} fontSize={11} fill="#0f172a" stroke="#fff" strokeWidth={3} paintOrder="stroke">
              {p.material.name}
            </text>
          ))}
        </svg>
        <p className="text-xs text-slate-500">
          Down and to the left is better. Blue dots are the trade-off front: nothing else is both lighter and cheaper. The dashed line joins designs with the same cost + α<sub>m</sub>·mass as the winner; move the
          α<sub>m</sub> slider and watch it tilt until it touches a different dot.
        </p>
      </div>
    </div>
  );
}
