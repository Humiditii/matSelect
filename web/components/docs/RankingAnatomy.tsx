'use client';

import { useState } from 'react';
import { useContainerWidth } from '../charts/chartHelpers';

// Rounded so the server and browser render identical SVG coordinates.
const round1 = (x: number) => Math.round(x * 10) / 10;

// The wall arm from the penalty demo, ranked by mass. Values from the same sizing
// formulas; the likely ranges are typical of what the Monte Carlo step gives.
const ROWS = [
  { name: 'Carbon fibre (CFRP)', value: 0.18, low: 0.15, high: 0.18 },
  { name: 'Aluminium 6061-T6', value: 0.4, low: 0.38, high: 0.4 },
  { name: 'Glass fibre (GFRP)', value: 0.48, low: 0.42, high: 0.48 },
  { name: 'Douglas fir', value: 0.55, low: 0.47, high: 0.55 },
  { name: 'Pine (C24)', value: 0.59, low: 0.49, high: 0.59 },
  { name: 'Mild steel', value: 0.68, low: 0.66, high: 0.68 },
];

const NOTES = [
  { id: 1, title: 'The bar', text: 'The calculated value with conservative data: the weak end of stiffness and strength. Here it is the mass of the arm, so shorter is better. Because it uses the weak end of the data, it sits at the heavy end of the thin line, on purpose.' },
  { id: 2, title: 'The thin line', text: 'Where the answer lands in the middle 80 % of the 1000 random runs (p10 to p90). A long line means the material’s data is uncertain.' },
  { id: 3, title: 'Overlapping lines', text: 'Douglas fir and pine overlap, so their order could swap with real timber from your supplier. That is a close call, not a clear winner.' },
  { id: 4, title: 'The top pick', text: 'Drawn darker. Its line doesn’t overlap anyone else’s, so the result is solid: carbon fibre is the lightest here by a wide margin.' },
];

export function RankingAnatomy() {
  const [active, setActive] = useState<number | null>(null);
  const { containerRef, width } = useContainerWidth();
  const labelWidth = Math.min(150, width * 0.36);
  const plotWidth = width - labelWidth - 56;
  const rowHeight = 30;
  const top = 6;
  const height = top + ROWS.length * rowHeight + 26;
  const max = 0.8;
  const toX = (v: number) =>
    round1(labelWidth + (v / max) * plotWidth);
  const dim = (ids: number[]) => (active === null || ids.includes(active) ? 1 : 0.25);

  const badge = (id: number, x: number, y: number) => (
    <g key={`b${id}`} opacity={active === null || active === id ? 1 : 0.35}>
      <circle cx={x} cy={y} r={9} fill={active === id ? '#0f172a' : '#e07b00'} />
      <text x={x} y={y + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff">
        {id}
      </text>
    </g>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div ref={containerRef} className="min-w-0">
        <svg width={width} height={height} role="img" aria-label="Annotated example of the ranking chart" className="block">
          {[0, 0.2, 0.4, 0.6, 0.8].map((t) => (
            <g key={t}>
              <line x1={toX(t)} x2={toX(t)} y1={top} y2={height - 26} stroke="#e2e8f0" />
              <text x={toX(t)} y={height - 10} textAnchor="middle" fontSize={11} fill="#64748b">
                {t} kg
              </text>
            </g>
          ))}
          {ROWS.map((row, i) => {
            const cy = top + i * rowHeight + rowHeight / 2;
            const best = i === 0;
            const overlapping = i === 3 || i === 4;
            return (
              <g key={row.name}>
                <text x={labelWidth - 8} y={cy + 4} textAnchor="end" fontSize={12} fontWeight={best ? 600 : 400} fill="#0f172a">
                  {width < 420 ? row.name.split(' ')[0] : row.name}
                </text>
                <rect x={labelWidth} y={cy - 8} width={toX(row.value) - labelWidth} height={16} rx={3} fill={best ? '#1d5ef1' : '#8ec3ff'} opacity={dim(best ? [1, 4] : [1])} />
                <g opacity={dim(overlapping ? [2, 3] : [2])}>
                  <line x1={toX(row.low)} x2={toX(row.high)} y1={cy} y2={cy} stroke="#334155" strokeWidth={1.5} />
                  <line x1={toX(row.low)} x2={toX(row.low)} y1={cy - 4} y2={cy + 4} stroke="#334155" strokeWidth={1.5} />
                  <line x1={toX(row.high)} x2={toX(row.high)} y1={cy - 4} y2={cy + 4} stroke="#334155" strokeWidth={1.5} />
                </g>
                <text x={toX(row.high) + 6} y={cy + 4} fontSize={11} fill="#64748b">
                  {row.value} kg
                </text>
              </g>
            );
          })}
          {badge(1, toX(ROWS[1].value / 2), top + rowHeight * 1.5)}
          {badge(2, toX(ROWS[2].high) + 44, top + rowHeight * 2.5)}
          {badge(3, toX(0.71), top + rowHeight * 4)}
          {badge(4, toX(ROWS[0].value / 2), top + rowHeight * 0.5 - 1)}
        </svg>
      </div>
      <ol className="space-y-2">
        {NOTES.map((note) => (
          <li
            key={note.id}
            tabIndex={0}
            onMouseEnter={() => setActive(note.id)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(note.id)}
            onBlur={() => setActive(null)}
            className={`flex gap-2 rounded-lg p-2 text-sm outline-none ${active === note.id ? 'bg-amber-50 ring-1 ring-amber-200' : ''}`}
          >
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#e07b00] text-[11px] font-bold text-white">{note.id}</span>
            <span>
              <strong className="text-slate-900">{note.title}.</strong> <span className="text-slate-700">{note.text}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
