'use client';

import { useEffect, useMemo, useState } from 'react';
import { FAMILY_LABEL, fmt, fmtUsd, materialName, pct } from '@/lib/labels';
import type { RankedMaterial, SelectionResult } from '@/lib/types';
import { Card, Segmented } from './ui';

// One accent for what matters (top pick / Pareto front), a neutral for context. Text always in slate ink.
const ACCENT = '#1d5ef1'; // brand-600
const ACCENT_SOFT = '#8ec3ff'; // brand-300
const NEUTRAL = '#94a3b8'; // slate-400
const GRID = '#e2e8f0'; // slate-200
const INK_MUTED = '#64748b'; // slate-500
const MAX_BARS = 12;

/** Tracks the rendered width of a container so the SVG keeps real pixel sizes (readable text on phones). */
function useWidth() {
  // Callback ref, so a remounted container (e.g. after the table view) is observed again.
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, width, el] as const;
}

function niceStep(raw: number) {
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
}

function linearTicks(max: number, count: number) {
  const step = niceStep(max / count);
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = 0; t <= top + step / 2; t += step) ticks.push(t);
  return { ticks, top };
}

function logTicks(min: number, max: number) {
  const lo = Math.floor(Math.log10(min));
  const hi = Math.ceil(Math.log10(max));
  const mults = hi - lo <= 2 ? [1, 2, 5] : [1];
  const ticks: number[] = [];
  for (let e = lo; e <= hi; e++) for (const m of mults) ticks.push(m * 10 ** e);
  return { ticks: ticks.filter((t) => t >= 10 ** lo && t <= 10 ** hi), lo: 10 ** lo, hi: 10 ** hi };
}

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

interface Tip {
  x: number;
  y: number;
  lines: string[];
  title: string;
}

function Tooltip({ tip, width }: { tip: Tip | null; width: number }) {
  if (!tip) return null;
  const left = Math.min(Math.max(tip.x + 12, 0), width - 220);
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 w-52 rounded-lg bg-white p-2.5 text-xs shadow-lg ring-1 ring-slate-200"
      style={{ left, top: Math.max(tip.y - 12, 0) }}
    >
      <p className="font-semibold text-slate-900">{tip.title}</p>
      {tip.lines.map((l) => (
        <p key={l} className="text-slate-600">
          {l}
        </p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ranking: one bar per material, p10–p90 whisker from the Monte Carlo runs
// ---------------------------------------------------------------------------
export function RankingChart({ res, format }: { res: SelectionResult; format: (x: number) => string }) {
  const [setRef, width, el] = useWidth();
  const [tip, setTip] = useState<Tip | null>(null);
  const rows = res.ranking.slice(0, MAX_BARS);
  const higherBetter = res.objectiveUnit === '%';

  const labelW = Math.min(200, Math.round(width * 0.36));
  const valueW = 72;
  const rowH = 30;
  const barH = 16;
  const top = 8;
  const axisH = 28;
  const plotW = Math.max(80, width - labelW - valueW - 8);
  const max = Math.max(...rows.map((r) => Math.max(r.objectiveValue, r.objectiveInterval[1])), 1e-12);
  const { ticks, top: domain } = linearTicks(max, width < 480 ? 3 : 5);
  const sx = (v: number) => labelW + (v / domain) * plotW;
  const height = top + rows.length * rowH + axisH;
  const nameChars = Math.max(10, Math.floor(labelW / 6.6));

  return (
    <div>
      <p className="mb-2 text-sm text-slate-600">
        {res.objectiveLabel} — {higherBetter ? 'longer is better' : 'shorter is better'}. The thin line is the likely range (p10–p90) across {fmt(res.mcSamples)} Monte Carlo runs.
        {res.ranking.length > MAX_BARS && ` Top ${MAX_BARS} of ${res.ranking.length}.`}
      </p>
      <div ref={setRef} className="relative" onMouseLeave={() => setTip(null)}>
        <svg width={width} height={height} role="img" aria-label={`Ranking chart: ${res.objectiveLabel}`} className="block">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={sx(t)} x2={sx(t)} y1={top} y2={height - axisH} stroke={GRID} />
              <text x={sx(t)} y={height - axisH + 16} textAnchor="middle" fontSize={11} fill={INK_MUTED}>
                {format(t)}
              </text>
            </g>
          ))}
          {rows.map((r, i) => {
            const y = top + i * rowH;
            const cy = y + rowH / 2;
            const w = Math.max(2, sx(r.objectiveValue) - labelW);
            const best = r.rank === 1;
            const show = (e: React.MouseEvent) => {
              const box = el!.getBoundingClientRect();
              setTip({
                x: e.clientX - box.left,
                y: e.clientY - box.top + 12,
                title: `${r.rank}. ${materialName(r)}`,
                lines: [
                  FAMILY_LABEL[r.family].label,
                  `${format(r.objectiveValue)} (likely ${format(r.objectiveInterval[0])}–${format(r.objectiveInterval[1])})`,
                  `Best in ${pct(r.pBest)} of runs · top 3 in ${pct(r.pTop3)}`,
                ],
              });
            };
            return (
              <g key={r.materialId} onMouseMove={show} onClick={show} className="cursor-default">
                {/* Hit target: the whole row */}
                <rect x={0} y={y} width={width} height={rowH} fill="transparent" />
                <text x={labelW - 8} y={cy + 4} textAnchor="end" fontSize={12} fill={best ? '#0f172a' : '#334155'} fontWeight={best ? 600 : 400}>
                  {truncate(materialName(r), nameChars)}
                </text>
                {/* Bar anchored at the baseline: square start, 4px rounded data end */}
                <path
                  d={`M${labelW},${cy - barH / 2} h${Math.max(0, w - 4)} a4,4 0 0 1 4,4 v${barH - 8} a4,4 0 0 1 -4,4 h${-Math.max(0, w - 4)} z`}
                  fill={best ? ACCENT : ACCENT_SOFT}
                />
                <line x1={sx(r.objectiveInterval[0])} x2={sx(r.objectiveInterval[1])} y1={cy} y2={cy} stroke="#334155" strokeWidth={1.5} />
                {[r.objectiveInterval[0], r.objectiveInterval[1]].map((v, k) => (
                  <line key={k} x1={sx(v)} x2={sx(v)} y1={cy - 4} y2={cy + 4} stroke="#334155" strokeWidth={1.5} />
                ))}
                <text x={Math.max(sx(r.objectiveValue), sx(r.objectiveInterval[1])) + 6} y={cy + 4} fontSize={11} fill={best ? '#0f172a' : INK_MUTED} fontWeight={best ? 600 : 400}>
                  {format(r.objectiveValue)}
                </text>
              </g>
            );
          })}
          <line x1={labelW} x2={labelW} y1={top} y2={height - axisH} stroke="#cbd5e1" />
        </svg>
        <Tooltip tip={tip} width={width} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trade-off: Ashby-style log–log scatter of mass vs cost or carbon, Pareto front highlighted
// ---------------------------------------------------------------------------
type YKey = 'cost' | 'co2';
interface Pt {
  r: RankedMaterial;
  x: number;
  y: number;
  pareto: boolean;
}

/** Non-dominated set: nothing else is both lighter and cheaper (or lower-carbon). */
function paretoFlags(pts: { x: number; y: number }[]) {
  return pts.map((p, i) => !pts.some((q, j) => j !== i && q.x <= p.x && q.y <= p.y && (q.x < p.x || q.y < p.y)));
}

export function TradeoffChart({ res }: { res: SelectionResult }) {
  const [setRef, width, el] = useWidth();
  const [tip, setTip] = useState<Tip | null>(null);
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const withData = res.ranking.filter((r) => r.tradeoff);
  const hasCost = withData.filter((r) => r.tradeoff!.cost !== null && r.tradeoff!.cost > 0).length >= 2;
  const hasCo2 = withData.filter((r) => r.tradeoff!.co2 !== null && r.tradeoff!.co2 > 0).length >= 2;
  const [yKey, setYKey] = useState<YKey>(hasCost ? 'cost' : 'co2');
  const relative = withData[0]?.tradeoff?.basis === 'relative';
  const alpha = res.ranking.find((r) => r.penalty)?.penalty ?? null;
  const balanced = res.spec.objective === 'balanced';

  const pts: Pt[] = useMemo(() => {
    const raw = withData
      .map((r) => ({ r, x: r.tradeoff!.mass, y: r.tradeoff![yKey] ?? NaN }))
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x > 0 && p.y > 0);
    const flags = paretoFlags(raw);
    return raw.map((p, i) => ({ ...p, pareto: flags[i] }));
  }, [withData, yKey]);

  if (!hasCost && !hasCo2) return null;

  const xLabel = relative ? 'Mass for the same performance (× lightest)' : 'Part mass (kg)';
  const yLabel =
    yKey === 'cost'
      ? relative
        ? 'Material cost for the same performance (relative)'
        : 'Material cost of the part (USD)'
      : relative
        ? 'Carbon for the same performance (relative)'
        : 'Carbon footprint of the part (kg CO₂e)';
  const fx = (v: number) => (relative ? `${fmt(v, 2)}×` : `${fmt(v, 2)} kg`);
  const fy = (v: number) => (relative ? fmt(v, 2) : yKey === 'cost' ? fmtUsd(v) : `${fmt(v, 2)} kg`);

  const m = { l: width < 480 ? 52 : 64, r: 16, t: 12, b: 44 };
  const height = Math.round(Math.min(420, Math.max(280, width * 0.62)));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const xt = logTicks(Math.min(...xs) / 1.3, Math.max(...xs) * 1.3);
  const yt = logTicks(Math.min(...ys) / 1.3, Math.max(...ys) * 1.3);
  const sx = (v: number) => m.l + ((Math.log10(v) - Math.log10(xt.lo)) / (Math.log10(xt.hi) - Math.log10(xt.lo))) * (width - m.l - m.r);
  const sy = (v: number) => height - m.b - ((Math.log10(v) - Math.log10(yt.lo)) / (Math.log10(yt.hi) - Math.log10(yt.lo))) * (height - m.t - m.b);

  const front = pts.filter((p) => p.pareto).sort((a, b) => a.x - b.x);
  // Lines of equal penalty on this projection: w_y·y + α_m·x = const, through the top pick (×1, ×2, ×4).
  const wy = alpha ? (yKey === 'cost' ? 1 : alpha.alphaCo2) : 0;
  const isoLines: { d: string; z: number }[] = [];
  const topPt = pts.find((p) => p.r.rank === 1);
  if (balanced && alpha && wy > 0 && topPt) {
    const z0 = wy * topPt.y + alpha.alphaMass * topPt.x;
    for (const k of [1, 2, 4]) {
      const z = z0 * k;
      const seg: string[] = [];
      for (let i = 0; i <= 80; i++) {
        const x = xt.lo * (xt.hi / xt.lo) ** (i / 80);
        const y = (z - alpha.alphaMass * x) / wy;
        if (y < yt.lo || y > yt.hi) continue;
        seg.push(`${seg.length ? 'L' : 'M'}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`);
      }
      if (seg.length > 1) isoLines.push({ d: seg.join(' '), z });
    }
  }

  const show = (p: Pt) => (e: React.MouseEvent) => {
    const box = el!.getBoundingClientRect();
    const t = p.r.tradeoff!;
    setTip({
      x: e.clientX - box.left,
      y: e.clientY - box.top + 12,
      title: `${p.r.rank}. ${materialName(p.r)}`,
      lines: [
        FAMILY_LABEL[p.r.family].label,
        `Mass: ${fx(t.mass)}`,
        ...(t.cost !== null ? [`Cost: ${relative ? fmt(t.cost, 2) : fmtUsd(t.cost)}`] : []),
        ...(t.co2 !== null ? [`Carbon: ${relative ? fmt(t.co2, 2) : `${fmt(t.co2, 2)} kg CO₂e`}`] : []),
        ...(p.r.penalty ? [`Penalty Z: ${fmtUsd(p.r.penalty.z)}`] : []),
        p.pareto ? 'On the trade-off front' : 'Beaten on both axes by a front material',
      ],
    });
  };

  // Direct labels only for the front (selective), skipping ones that would collide vertically.
  const labelled = new Set<string>();
  const usedY: number[] = [];
  for (const p of front) {
    const y = sy(p.y);
    if (usedY.some((u) => Math.abs(u - y) < 14)) continue;
    usedY.push(y);
    labelled.add(p.r.materialId);
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-slate-600">
          Each dot is a material that fits. Down and to the left is better. <span className="font-medium text-slate-900">Blue dots</span> form the trade-off front: no other material is better on both axes.
          {isoLines.length > 0 && ' Dashed lines join designs of equal penalty; the top pick sits on the lowest one.'}
          {relative && ' Values are per unit of performance, relative to the lightest candidate.'}
        </p>
        <div className="flex gap-2">
          {hasCost && hasCo2 && (
            <Segmented
              value={yKey}
              onChange={setYKey}
              options={[
                { value: 'cost', label: 'Cost' },
                { value: 'co2', label: 'Carbon' },
              ]}
            />
          )}
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: 'chart', label: 'Chart' },
              { value: 'table', label: 'Table' },
            ]}
          />
        </div>
      </div>

      {view === 'table' ? (
        <div className="-mx-4 overflow-x-auto sm:-mx-6">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 sm:pl-6">#</th>
                <th className="px-3 py-2">Material</th>
                <th className="px-3 py-2">Mass</th>
                <th className="px-3 py-2">{yKey === 'cost' ? 'Cost' : 'Carbon'}</th>
                <th className="px-3 py-2 sm:pr-6">On the front</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pts.map((p) => (
                <tr key={p.r.materialId}>
                  <td className="px-4 py-2 font-semibold text-slate-500 sm:pl-6">{p.r.rank}</td>
                  <td className="px-3 py-2 font-medium text-slate-900">{materialName(p.r)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-700">{fx(p.x)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-700">{fy(p.y)}</td>
                  <td className="px-3 py-2 text-slate-700 sm:pr-6">{p.pareto ? '● Yes' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={setRef} className="relative" onMouseLeave={() => setTip(null)}>
          <svg width={width} height={height} role="img" aria-label={`Trade-off chart: ${xLabel} against ${yLabel}`} className="block">
            {xt.ticks.map((t) => (
              <g key={`x${t}`}>
                <line x1={sx(t)} x2={sx(t)} y1={m.t} y2={height - m.b} stroke={GRID} />
                <text x={sx(t)} y={height - m.b + 15} textAnchor="middle" fontSize={11} fill={INK_MUTED}>
                  {relative ? `${fmt(t, 2)}×` : fmt(t, 2)}
                </text>
              </g>
            ))}
            {yt.ticks.map((t) => (
              <g key={`y${t}`}>
                <line x1={m.l} x2={width - m.r} y1={sy(t)} y2={sy(t)} stroke={GRID} />
                <text x={m.l - 6} y={sy(t) + 4} textAnchor="end" fontSize={11} fill={INK_MUTED}>
                  {!relative && yKey === 'cost' ? `$${fmt(t, 2)}` : fmt(t, 2)}
                </text>
              </g>
            ))}
            <text x={(m.l + width - m.r) / 2} y={height - 6} textAnchor="middle" fontSize={12} fill="#334155">
              {xLabel} →
            </text>
            <text transform={`translate(12 ${(m.t + height - m.b) / 2}) rotate(-90)`} textAnchor="middle" fontSize={12} fill="#334155">
              {width < 480 ? (yKey === 'cost' ? 'Cost →' : 'Carbon →') : `${yLabel} →`}
            </text>

            {isoLines.map((l, i) => (
              <path key={l.z} d={l.d} fill="none" stroke={NEUTRAL} strokeWidth={1.5} strokeDasharray="5 4">
                <title>{`Equal penalty${i === 0 ? ' (top pick)' : ''}: Z ≈ ${fmtUsd(l.z)}`}</title>
              </path>
            ))}
            {front.length > 1 && (
              <polyline
                points={front.map((p) => `${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ')}
                fill="none"
                stroke={ACCENT}
                strokeWidth={2}
                strokeLinejoin="round"
                opacity={0.6}
              />
            )}
            {/* Context first, front on top; 2px surface ring keeps overlapping dots apart. */}
            {[...pts].sort((a, b) => Number(a.pareto) - Number(b.pareto)).map((p) => (
              <g key={p.r.materialId} onMouseMove={show(p)} onClick={show(p)}>
                <circle cx={sx(p.x)} cy={sy(p.y)} r={12} fill="transparent" />
                <circle
                  cx={sx(p.x)}
                  cy={sy(p.y)}
                  r={p.r.rank === 1 ? 7 : 5}
                  fill={p.pareto ? ACCENT : NEUTRAL}
                  stroke="#fff"
                  strokeWidth={2}
                />
                {p.r.rank === 1 && <circle cx={sx(p.x)} cy={sy(p.y)} r={11} fill="none" stroke={ACCENT} strokeWidth={1.5} />}
              </g>
            ))}
            {pts
              .filter((p) => labelled.has(p.r.materialId))
              .map((p) => {
                const x = sx(p.x);
                const right = x < width * 0.65;
                return (
                  <text
                    key={`l${p.r.materialId}`}
                    x={right ? x + 12 : x - 12}
                    y={sy(p.y) + 4}
                    textAnchor={right ? 'start' : 'end'}
                    fontSize={11}
                    fill="#0f172a"
                    fontWeight={p.r.rank === 1 ? 600 : 400}
                    className="pointer-events-none"
                    paintOrder="stroke"
                    stroke="#fff"
                    strokeWidth={3}
                  >
                    {truncate(p.r.name, width < 480 ? 14 : 24)}
                  </text>
                );
              })}
          </svg>
          <Tooltip tip={tip} width={width} />
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-600">
            <span className="flex items-center gap-1.5">
              <svg width="12" height="12" aria-hidden>
                <circle cx="6" cy="6" r="5" fill={ACCENT} />
              </svg>
              Trade-off front
            </span>
            <span className="flex items-center gap-1.5">
              <svg width="12" height="12" aria-hidden>
                <circle cx="6" cy="6" r="5" fill={NEUTRAL} />
              </svg>
              Other materials that fit
            </span>
            <span className="flex items-center gap-1.5">
              <svg width="16" height="16" aria-hidden>
                <circle cx="8" cy="8" r="7" fill="none" stroke={ACCENT} strokeWidth="1.5" />
              </svg>
              Top pick
            </span>
            {isoLines.length > 0 && (
              <span className="flex items-center gap-1.5">
                <svg width="20" height="6" aria-hidden>
                  <line x1="0" x2="20" y1="3" y2="3" stroke={NEUTRAL} strokeWidth="1.5" strokeDasharray="5 4" />
                </svg>
                Equal penalty (×1, ×2, ×4 of the top pick)
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** "Compare visually": ranking bars and the trade-off chart behind one toggle. */
export function ChartsCard({ res, format }: { res: SelectionResult; format: (x: number) => string }) {
  const hasTradeoff = res.ranking.filter((r) => r.tradeoff).length >= 2;
  const [tab, setTab] = useState<'ranking' | 'tradeoff'>('ranking');
  if (res.ranking.length < 2) return null;
  return (
    <Card
      title="Compare visually"
      action={
        hasTradeoff ? (
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'ranking', label: '📊 Ranking' },
              { value: 'tradeoff', label: '⚖️ Trade-off' },
            ]}
          />
        ) : undefined
      }
    >
      {tab === 'ranking' || !hasTradeoff ? <RankingChart res={res} format={format} /> : <TradeoffChart res={res} />}
    </Card>
  );
}
