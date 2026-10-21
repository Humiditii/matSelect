'use client';

import { useRef, useState } from 'react';
import { Button } from '../ui';
import { useContainerWidth } from '../charts/chartHelpers';
import { DEMO_MATERIALS, DemoMaterial, formatNumber, mulberry32, sampleLogUniform, typical } from './demoPhysics';

// Rounded so the server and browser render identical SVG coordinates.
const round1 = (x: number) => Math.round(x * 10) / 10;

// Two softwoods whose ranges overlap: a fair fight for a stiff, light beam (index E^(1/2)/ρ).
const RIVALS = [
  { material: DEMO_MATERIALS.find((m) => m.id === 'fir')!, color: '#1d5ef1' },
  { material: DEMO_MATERIALS.find((m) => m.id === 'pine')!, color: '#e07b00' },
];
// Index values are shown ×1000 so the numbers are easy to read.
const SCALE = 1000;
const DOMAIN: [number, number] = [4.8, 7.8];
const BINS = 30;
const SEED = 20261021;

interface Draw {
  E: number;
  density: number;
  index: number;
}

const indexOf = (E: number, density: number) => (Math.sqrt(E) / density) * SCALE;

function conservativeIndex(m: DemoMaterial) {
  return indexOf(m.E[0], typical(m.density));
}

function percentile(sorted: number[], q: number) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const i = Math.floor(pos);
  return i + 1 < sorted.length ? sorted[i] + (sorted[i + 1] - sorted[i]) * (pos - i) : sorted[i];
}

export function MonteCarloDemo() {
  const rng = useRef(mulberry32(SEED));
  const [draws, setDraws] = useState<Draw[][]>([[], []]);
  const [wins, setWins] = useState([0, 0]);
  const [last, setLast] = useState<Draw[] | null>(null);
  const { containerRef, width } = useContainerWidth();

  const run = (count: number) => {
    const next = draws.map((list) => [...list]);
    const nextWins = [...wins];
    let latest: Draw[] = [];
    for (let i = 0; i < count; i++) {
      // Every property of every material is drawn from its own range, log-uniformly.
      latest = RIVALS.map(({ material }) => {
        const E = sampleLogUniform(rng.current, material.E);
        const density = sampleLogUniform(rng.current, material.density);
        return { E, density, index: indexOf(E, density) };
      });
      latest.forEach((draw, j) => next[j].push(draw));
      nextWins[latest[0].index >= latest[1].index ? 0 : 1]++;
    }
    setDraws(next);
    setWins(nextWins);
    setLast(latest);
  };

  const reset = () => {
    rng.current = mulberry32(SEED);
    setDraws([[], []]);
    setWins([0, 0]);
    setLast(null);
  };

  const total = wins[0] + wins[1];
  const margin = { left: 12, right: 12 };
  const plotWidth = width - margin.left - margin.right;
  const toX = (v: number) =>
    round1(margin.left + ((v - DOMAIN[0]) / (DOMAIN[1] - DOMAIN[0])) * plotWidth);
  const binWidth = (DOMAIN[1] - DOMAIN[0]) / BINS;
  const histograms = draws.map((list) => {
    const counts = new Array<number>(BINS).fill(0);
    for (const d of list) counts[Math.min(BINS - 1, Math.max(0, Math.floor((d.index - DOMAIN[0]) / binWidth)))]++;
    return counts;
  });
  const tallest = Math.max(1, ...histograms.flat());
  const rowHeight = 70;
  const ticks = [5, 5.5, 6, 6.5, 7, 7.5];

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        {RIVALS.map(({ material, color }, j) => (
          <div key={material.id} className="rounded-xl p-3 text-sm ring-1 ring-slate-200">
            <p className="flex items-center gap-2 font-semibold text-slate-900">
              <span className="inline-block h-3 w-3 rounded-full" style={{ background: color }} />
              {material.name}
            </p>
            <p className="mt-1 text-slate-600">
              E = {material.E[0]}–{material.E[1]} GPa · ρ = {material.density[0]}–{material.density[1]} kg/m³
            </p>
            <p className="text-slate-600">
              Conservative index: <strong className="text-slate-900">{formatNumber(conservativeIndex(material))}</strong>
            </p>
            {last && (
              <p className="mt-1 rounded bg-slate-50 px-2 py-1 text-xs text-slate-700">
                Last draw: E = {formatNumber(last[j].E)} GPa, ρ = {formatNumber(last[j].density)} → index <strong>{formatNumber(last[j].index)}</strong>
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => run(1)}>
          🎲 Draw once
        </Button>
        <Button size="sm" variant="secondary" onClick={() => run(100)}>
          +100 draws
        </Button>
        <Button size="sm" variant="secondary" onClick={() => run(1000)}>
          +1000 draws
        </Button>
        <Button size="sm" variant="ghost" onClick={reset} disabled={!total}>
          Reset
        </Button>
      </div>

      <div ref={containerRef}>
        <svg width={width} height={rowHeight * 2 + 40} role="img" aria-label="Histograms of the index for each material across the random draws" className="block">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={toX(t)} x2={toX(t)} y1={0} y2={rowHeight * 2 + 16} stroke="#e2e8f0" />
              <text x={toX(t)} y={rowHeight * 2 + 30} textAnchor="middle" fontSize={11} fill="#64748b">
                {t}
              </text>
            </g>
          ))}
          {histograms.map((counts, j) => {
            const base = rowHeight * (j + 1);
            const sorted = draws[j].map((d) => d.index).sort((a, b) => a - b);
            const p10 = percentile(sorted, 0.1);
            const p90 = percentile(sorted, 0.9);
            return (
              <g key={j}>
                <line x1={margin.left} x2={width - margin.right} y1={base} y2={base} stroke="#cbd5e1" />
                {counts.map((count, b) => {
                  const h = (count / tallest) * (rowHeight - 18);
                  const x = toX(DOMAIN[0] + b * binWidth);
                  return count ? <rect key={b} x={x + 1} y={base - h} width={Math.max(1, plotWidth / BINS - 2)} height={h} rx={1.5} fill={RIVALS[j].color} /> : null;
                })}
                {sorted.length > 9 && (
                  <g>
                    <line x1={toX(p10)} x2={toX(p90)} y1={base + 8} y2={base + 8} stroke="#334155" strokeWidth={1.5} />
                    <line x1={toX(p10)} x2={toX(p10)} y1={base + 4} y2={base + 12} stroke="#334155" strokeWidth={1.5} />
                    <line x1={toX(p90)} x2={toX(p90)} y1={base + 4} y2={base + 12} stroke="#334155" strokeWidth={1.5} />
                  </g>
                )}
                <line x1={toX(conservativeIndex(RIVALS[j].material))} x2={toX(conservativeIndex(RIVALS[j].material))} y1={base - rowHeight + 14} y2={base} stroke="#0f172a" strokeDasharray="3 3" />
                <text x={margin.left + 2} y={base - rowHeight + 12} fontSize={11} fill="#334155">
                  {RIVALS[j].material.name}: {draws[j].length} draws
                </text>
              </g>
            );
          })}
        </svg>
        <p className="text-xs text-slate-500">
          Index E<sup>1/2</sup>/ρ (×1000) for a stiff, light beam: further right is better. Dashed line: the conservative value used for the main ranking. Black bar: the middle 80 % of draws (p10–p90).
        </p>
      </div>

      <div>
        <p className="text-sm font-semibold text-slate-900">Who came out on top{total ? ` in ${formatNumber(total)} draws` : ''}?</p>
        <div className="mt-2 flex h-7 overflow-hidden rounded-lg bg-slate-100 text-xs font-semibold text-white">
          {total > 0 &&
            RIVALS.map(({ material, color }, j) => (
              <div key={material.id} className="flex items-center justify-center gap-1 whitespace-nowrap px-1" style={{ width: `${(wins[j] / total) * 100}%`, background: color }}>
                {wins[j] / total > 0.12 && `${Math.round((wins[j] / total) * 100)}%`}
              </div>
            ))}
        </div>
        <p className="mt-1 text-xs text-slate-600">
          {total
            ? `${RIVALS[0].material.name} is the best in ${Math.round((wins[0] / total) * 100)}% of draws, ${RIVALS[1].material.name} in ${Math.round((wins[1] / total) * 100)}%. This is the "chance it's the best" on the results page.`
            : 'Press a button to start drawing.'}
        </p>
      </div>
    </div>
  );
}
