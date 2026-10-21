'use client';

import { useState } from 'react';
import { Segmented } from '../ui';
import { useContainerWidth } from '../charts/chartHelpers';
import { Range, formatNumber, typical } from './demoPhysics';
import { placeLabels } from './labelPlacement';

// Rounded so the server and browser render identical SVG coordinates.
const round1 = (x: number) => Math.round(x * 10) / 10;

interface ChartMaterial {
  name: string;
  short: string;
  family: string;
  /** kg/m³ */
  density: Range;
  /** GPa */
  E: Range;
}

// Property ranges from the built-in demo materials.
const MATERIALS: ChartMaterial[] = [
  {
    name: 'Mild steel',
    short: 'Steel',
    family: 'Metal',
    density: [7800, 7900],
    E: [200, 215],
  },
  {
    name: 'Aluminium 6061',
    short: 'Aluminium',
    family: 'Metal',
    density: [2690, 2720],
    E: [68, 71],
  },
  {
    name: 'Titanium Ti-6Al-4V',
    short: 'Titanium',
    family: 'Metal',
    density: [4400, 4450],
    E: [110, 119],
  },
  {
    name: 'Carbon fibre (CFRP)',
    short: 'CFRP',
    family: 'Composite',
    density: [1500, 1600],
    E: [110, 140],
  },
  {
    name: 'Glass fibre (GFRP)',
    short: 'GFRP',
    family: 'Composite',
    density: [1800, 2000],
    E: [23, 30],
  },
  {
    name: 'Pine',
    short: 'Pine',
    family: 'Wood',
    density: [450, 550],
    E: [7.4, 12],
  },
  {
    name: 'Douglas fir',
    short: 'Fir',
    family: 'Wood',
    density: [500, 580],
    E: [10, 14],
  },
  {
    name: 'Alumina ceramic',
    short: 'Alumina',
    family: 'Ceramic',
    density: [3700, 3800],
    E: [300, 370],
  },
  {
    name: 'Window glass',
    short: 'Glass',
    family: 'Ceramic / glass',
    density: [2440, 2520],
    E: [68, 72],
  },
  {
    name: 'Concrete',
    short: 'Concrete',
    family: 'Ceramic',
    density: [2300, 2400],
    E: [25, 35],
  },
  {
    name: 'Rigid PVC',
    short: 'PVC',
    family: 'Plastic',
    density: [1380, 1450],
    E: [2.4, 3.2],
  },
  {
    name: 'Nylon PA66',
    short: 'Nylon',
    family: 'Plastic',
    density: [1130, 1150],
    E: [2.5, 3.5],
  },
  {
    name: 'Natural rubber',
    short: 'Rubber',
    family: 'Rubber',
    density: [920, 1000],
    E: [0.0015, 0.0025],
  },
  {
    name: 'Polystyrene foam (EPS)',
    short: 'EPS foam',
    family: 'Foam',
    density: [15, 35],
    E: [0.003, 0.01],
  },
];

const INDICES = {
  tie: { power: 1, name: 'Tie', exponent: '' },
  beam: { power: 2, name: 'Beam', exponent: '1/2' },
  plank: { power: 3, name: 'Plank', exponent: '1/3' },
} as const;
type IndexKind = keyof typeof INDICES;

const X_DOMAIN: Range = [10, 20000];
const Y_DOMAIN: Range = [0.001, 1000];

/**
 * Stiffness against density on log scales, the way Ashby draws it. A material
 * index becomes a straight line; everything above the line beats it.
 */
const indexFor = (power: number) => (m: ChartMaterial) => m.E[0] ** (1 / power) / typical(m.density);

function indexScale(power: number) {
  const values = MATERIALS.map(indexFor(power));
  return {
    low: Math.min(...values) / 2,
    high: Math.max(...values) * 1.2,
    values,
  };
}

// Start with the line just below the fourth-best material, so a short list sits above it.
function startPosition(power: number) {
  const { low, high, values } = indexScale(power);
  const fourth = [...values].sort((a, b) => b - a)[3];
  return Math.log((fourth * 0.97) / low) / Math.log(high / low);
}

export function AshbyChartDemo() {
  const [kind, setKind] = useState<IndexKind>('beam');
  // The line position is the index value, chosen on a log slider.
  const [position, setPosition] = useState(() => startPosition(INDICES.beam.power));
  const { containerRef, width } = useContainerWidth();
  const { power } = INDICES[kind];

  const indexOf = indexFor(power);
  const { low: lowIndex, high: highIndex } = indexScale(power);
  const threshold = lowIndex * (highIndex / lowIndex) ** position;

  const narrow = width < 520;
  const margin = { left: 52, right: 12, top: 12, bottom: 40 };
  const height = narrow ? 340 : 420;
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const toX = (v: number) => round1(margin.left + (Math.log10(v / X_DOMAIN[0]) / Math.log10(X_DOMAIN[1] / X_DOMAIN[0])) * plotWidth);
  const toY = (v: number) => round1(margin.top + plotHeight - (Math.log10(v / Y_DOMAIN[0]) / Math.log10(Y_DOMAIN[1] / Y_DOMAIN[0])) * plotHeight);

  // On the line, index = E^(1/n)/ρ is constant, so E = (index·ρ)^n: slope n on log-log axes.
  const lineAt = (density: number) => (threshold * density) ** power;
  const xTicks = [10, 100, 1000, 10000];
  const yTicks = [0.001, 0.01, 0.1, 1, 10, 100, 1000];
  const winners = MATERIALS.filter((m) => indexOf(m) >= threshold);

  const bubbles = MATERIALS.map((m) => {
    const x1 = toX(m.density[0]);
    const x2 = toX(m.density[1]);
    const y1 = toY(m.E[1]);
    const y2 = toY(m.E[0]);
    const w = Math.max(10, x2 - x1);
    const h = Math.max(10, y2 - y1);
    return { material: m, cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, w, h };
  });
  const labels = placeLabels(
    bubbles.map((b) => ({ cx: b.cx, cy: b.cy, w: b.w, h: b.h, label: b.material.short })),
    { x: margin.left, y: margin.top, w: plotWidth, h: plotHeight },
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          value={kind}
          onChange={(k) => {
            setKind(k);
            setPosition(startPosition(INDICES[k].power));
          }}
          options={(Object.keys(INDICES) as IndexKind[]).map((k) => ({
            value: k,
            label: (
              <>
                {INDICES[k].name}: E{INDICES[k].exponent && <sup>{INDICES[k].exponent}</sup>}/ρ
              </>
            ),
          }))}
        />
      </div>
      <label className="block max-w-md">
        <span className="text-sm font-medium text-slate-700">Slide the selection line up (demand more)</span>
        <input type="range" className="mt-1 w-full accent-brand-600" min={0} max={1} step={0.005} value={position} onChange={(e) => setPosition(Number(e.target.value))} />
      </label>

      <div ref={containerRef}>
        <svg width={width} height={height} role="img" aria-label="Ashby chart of Young's modulus against density" className="block">
          <defs>
            <clipPath id="ashby-plot">
              <rect x={margin.left} y={margin.top} width={plotWidth} height={plotHeight} />
            </clipPath>
          </defs>
          {xTicks.map((t) => (
            <g key={`x${t}`}>
              <line x1={toX(t)} x2={toX(t)} y1={margin.top} y2={height - margin.bottom} stroke="#e2e8f0" />
              <text x={toX(t)} y={height - margin.bottom + 14} textAnchor="middle" fontSize={11} fill="#64748b">
                {formatNumber(t)}
              </text>
            </g>
          ))}
          {yTicks.map((t) => (
            <g key={`y${t}`}>
              <line x1={margin.left} x2={width - margin.right} y1={toY(t)} y2={toY(t)} stroke="#e2e8f0" />
              <text x={margin.left - 6} y={toY(t) + 4} textAnchor="end" fontSize={11} fill="#64748b">
                {formatNumber(t)}
              </text>
            </g>
          ))}
          <text x={(margin.left + width - margin.right) / 2} y={height - 6} textAnchor="middle" fontSize={12} fill="#334155">
            Density ρ (kg/m³) →
          </text>
          <text transform={`translate(12 ${margin.top + plotHeight / 2}) rotate(-90)`} textAnchor="middle" fontSize={12} fill="#334155">
            Stiffness E (GPa) →
          </text>

          <g clipPath="url(#ashby-plot)">
            {/* Shade the winning side of the line. */}
            <polygon
              points={[
                `${toX(X_DOMAIN[0])},${toY(lineAt(X_DOMAIN[0]))}`,
                `${toX(X_DOMAIN[1])},${toY(lineAt(X_DOMAIN[1]))}`,
                `${toX(X_DOMAIN[1])},${margin.top - 1000}`,
                `${toX(X_DOMAIN[0])},${margin.top - 1000}`,
              ].join(' ')}
              fill="#1d5ef1"
              opacity={0.06}
            />
            <line x1={toX(X_DOMAIN[0])} y1={toY(lineAt(X_DOMAIN[0]))} x2={toX(X_DOMAIN[1])} y2={toY(lineAt(X_DOMAIN[1]))} stroke="#1d5ef1" strokeWidth={2} strokeDasharray="6 4" />
            {bubbles.map((b) => {
              const m = b.material;
              const wins = indexOf(m) >= threshold;
              return (
                <g key={m.name}>
                  <title>{`${m.name} (${m.family}): ρ ${m.density[0]}–${m.density[1]} kg/m³, E ${m.E[0]}–${m.E[1]} GPa, index ${formatNumber(indexOf(m))}`}</title>
                  <ellipse cx={b.cx} cy={b.cy} rx={b.w / 2} ry={b.h / 2} fill={wins ? '#1d5ef1' : '#94a3b8'} stroke="#fff" strokeWidth={2} />
                </g>
              );
            })}
            {bubbles.map((b, i) => (
              <text
                key={`label-${b.material.name}`}
                x={labels[i].x + 2}
                y={labels[i].y + 10}
                fontSize={11}
                fontWeight={indexOf(b.material) >= threshold ? 600 : 400}
                fill="#0f172a"
                stroke="#fff"
                strokeWidth={3}
                paintOrder="stroke"
                className="pointer-events-none"
              >
                {b.material.short}
              </text>
            ))}
          </g>
        </svg>
      </div>
      <p className="text-sm text-slate-700">
        {winners.length ? (
          <>
            Above the line ({winners.length}): <strong>{winners.map((m) => m.short).join(', ')}</strong>. Every one of them makes a{' '}
            {kind === 'tie' ? 'stiff tie' : kind === 'beam' ? 'stiff beam' : 'stiff plank'} lighter than anything below the line.
          </>
        ) : (
          'Nothing is above the line: you are asking for more than any material can give. Slide it down.'
        )}
      </p>
    </div>
  );
}
