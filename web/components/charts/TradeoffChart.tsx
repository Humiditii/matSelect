'use client';

import { useMemo, useState } from 'react';
import { FAMILY_LABEL, formatNumber, formatUsd, materialName } from '@/lib/labels';
import type { RankedMaterial, SelectionResult } from '@/lib/types';
import { Segmented } from '../ui';
import {
  ACCENT,
  ChartTooltip,
  GRID,
  INK_MUTED,
  NARROW_WIDTH,
  NEUTRAL,
  TooltipContent,
  logTicks,
  tooltipAt,
  truncate,
  useContainerWidth,
} from './chartHelpers';

type YAxisMetric = 'cost' | 'co2';

interface ChartPoint {
  material: RankedMaterial;
  x: number;
  y: number;
  onFront: boolean;
}

const AXIS_LABEL_COLOR = '#334155';

/** Marks the points no other point beats on both axes (lighter and cheaper, or lighter and lower-carbon). */
function paretoFront(points: { x: number; y: number }[]) {
  return points.map(
    (point, i) => !points.some((other, j) => j !== i && other.x <= point.x && other.y <= point.y && (other.x < point.x || other.y < point.y)),
  );
}

function yAxisLabel(metric: YAxisMetric, relative: boolean) {
  if (metric === 'cost') return relative ? 'Material cost for the same performance (relative)' : 'Material cost of the part (USD)';
  return relative ? 'Carbon for the same performance (relative)' : 'Carbon footprint of the part (kg CO₂e)';
}

const countPositive = (materials: RankedMaterial[], metric: YAxisMetric) =>
  materials.filter((material) => {
    const value = material.tradeoff![metric];
    return value !== null && value > 0;
  }).length;

/** Ashby-style log-log scatter of mass against cost or carbon, with the trade-off (Pareto) front highlighted. */
export function TradeoffChart({ result }: { result: SelectionResult }) {
  const { containerRef, container, width } = useContainerWidth();
  const [tooltip, setTooltip] = useState<TooltipContent | null>(null);
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const withData = result.ranking.filter((material) => material.tradeoff);
  const hasCost = countPositive(withData, 'cost') >= 2;
  const hasCo2 = countPositive(withData, 'co2') >= 2;
  const [metric, setMetric] = useState<YAxisMetric>(hasCost ? 'cost' : 'co2');
  const relative = withData[0]?.tradeoff?.basis === 'relative';
  const penaltyWeights = result.ranking.find((material) => material.penalty)?.penalty ?? null;
  const isBalancedGoal = result.spec.objective === 'balanced';

  const points: ChartPoint[] = useMemo(() => {
    const raw = withData
      .map((material) => ({ material, x: material.tradeoff!.mass, y: material.tradeoff![metric] ?? NaN }))
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y) && point.x > 0 && point.y > 0);
    const onFront = paretoFront(raw);
    return raw.map((point, i) => ({ ...point, onFront: onFront[i] }));
  }, [withData, metric]);

  if (!hasCost && !hasCo2) return null;

  const narrow = width < NARROW_WIDTH;
  const xLabel = relative ? 'Mass for the same performance (× lightest)' : 'Part mass (kg)';
  const yLabel = yAxisLabel(metric, relative);
  const formatX = (value: number) => (relative ? `${formatNumber(value, 2)}×` : `${formatNumber(value, 2)} kg`);
  const formatY = (value: number) => {
    if (relative) return formatNumber(value, 2);
    return metric === 'cost' ? formatUsd(value) : `${formatNumber(value, 2)} kg`;
  };

  const margin = { left: narrow ? 52 : 64, right: 16, top: 12, bottom: 44 };
  const height = Math.round(Math.min(420, Math.max(280, width * 0.62)));
  const plotBottom = height - margin.bottom;
  const xValues = points.map((point) => point.x);
  const yValues = points.map((point) => point.y);
  const xAxis = logTicks(Math.min(...xValues) / 1.3, Math.max(...xValues) * 1.3);
  const yAxis = logTicks(Math.min(...yValues) / 1.3, Math.max(...yValues) * 1.3);
  const logFraction = (value: number, axis: { low: number; high: number }) =>
    (Math.log10(value) - Math.log10(axis.low)) / (Math.log10(axis.high) - Math.log10(axis.low));
  const toX = (value: number) => margin.left + logFraction(value, xAxis) * (width - margin.left - margin.right);
  const toY = (value: number) => plotBottom - logFraction(value, yAxis) * (height - margin.top - margin.bottom);

  const front = points.filter((point) => point.onFront).sort((a, b) => a.x - b.x);

  // Lines of equal penalty on this view: yWeight·y + alphaMass·x = Z, drawn through the top pick at Z ×1, ×2 and ×4.
  const yWeight = penaltyWeights ? (metric === 'cost' ? 1 : penaltyWeights.alphaCo2) : 0;
  const equalPenaltyLines: { path: string; penalty: number }[] = [];
  const topPick = points.find((point) => point.material.rank === 1);
  if (isBalancedGoal && penaltyWeights && yWeight > 0 && topPick) {
    const topPickPenalty = yWeight * topPick.y + penaltyWeights.alphaMass * topPick.x;
    for (const multiple of [1, 2, 4]) {
      const penalty = topPickPenalty * multiple;
      const segments: string[] = [];
      for (let step = 0; step <= 80; step++) {
        const x = xAxis.low * (xAxis.high / xAxis.low) ** (step / 80);
        const y = (penalty - penaltyWeights.alphaMass * x) / yWeight;
        if (y < yAxis.low || y > yAxis.high) continue;
        segments.push(`${segments.length ? 'L' : 'M'}${toX(x).toFixed(1)},${toY(y).toFixed(1)}`);
      }
      if (segments.length > 1) equalPenaltyLines.push({ path: segments.join(' '), penalty });
    }
  }

  const showTooltip = (point: ChartPoint) => (event: React.MouseEvent) => {
    const { material } = point;
    const tradeoff = material.tradeoff!;
    const lines = [FAMILY_LABEL[material.family].label, `Mass: ${formatX(tradeoff.mass)}`];
    if (tradeoff.cost !== null) {
      lines.push(`Cost: ${relative ? formatNumber(tradeoff.cost, 2) : formatUsd(tradeoff.cost)}`);
    }
    if (tradeoff.co2 !== null) {
      lines.push(`Carbon: ${relative ? formatNumber(tradeoff.co2, 2) : `${formatNumber(tradeoff.co2, 2)} kg CO₂e`}`);
    }
    if (material.penalty) lines.push(`Penalty Z: ${formatUsd(material.penalty.z)}`);
    lines.push(point.onFront ? 'On the trade-off front' : 'Beaten on both axes by a front material');
    setTooltip(tooltipAt(event, container!, `${material.rank}. ${materialName(material)}`, lines));
  };

  // Label only the front points directly, skipping any that would overlap the one above.
  const labelledIds = new Set<string>();
  const usedLabelY: number[] = [];
  for (const point of front) {
    const y = toY(point.y);
    if (usedLabelY.some((used) => Math.abs(used - y) < 14)) continue;
    usedLabelY.push(y);
    labelledIds.add(point.material.materialId);
  }

  // Draw the other materials first so the front sits on top.
  const pointsInDrawOrder = [...points].sort((a, b) => Number(a.onFront) - Number(b.onFront));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-slate-600">
          Each dot is a material that fits. Down and to the left is better. <span className="font-medium text-slate-900">Blue dots</span>{' '}
          form the trade-off front: no other material is better on both axes.
          {equalPenaltyLines.length > 0 && ' Dashed lines join designs of equal penalty; the top pick sits on the lowest one.'}
          {relative && ' Values are per unit of performance, relative to the lightest candidate.'}
        </p>
        <div className="flex gap-2">
          {hasCost && hasCo2 && (
            <Segmented
              value={metric}
              onChange={setMetric}
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
                <th className="px-3 py-2">{metric === 'cost' ? 'Cost' : 'Carbon'}</th>
                <th className="px-3 py-2 sm:pr-6">On the front</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {points.map((point) => (
                <tr key={point.material.materialId}>
                  <td className="px-4 py-2 font-semibold text-slate-500 sm:pl-6">{point.material.rank}</td>
                  <td className="px-3 py-2 font-medium text-slate-900">{materialName(point.material)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-700">{formatX(point.x)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-700">{formatY(point.y)}</td>
                  <td className="px-3 py-2 text-slate-700 sm:pr-6">{point.onFront ? '● Yes' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={containerRef} className="relative" onMouseLeave={() => setTooltip(null)}>
          <svg width={width} height={height} role="img" aria-label={`Trade-off chart: ${xLabel} against ${yLabel}`} className="block">
            {xAxis.ticks.map((tick) => (
              <g key={`x${tick}`}>
                <line x1={toX(tick)} x2={toX(tick)} y1={margin.top} y2={plotBottom} stroke={GRID} />
                <text x={toX(tick)} y={plotBottom + 15} textAnchor="middle" fontSize={11} fill={INK_MUTED}>
                  {relative ? `${formatNumber(tick, 2)}×` : formatNumber(tick, 2)}
                </text>
              </g>
            ))}
            {yAxis.ticks.map((tick) => (
              <g key={`y${tick}`}>
                <line x1={margin.left} x2={width - margin.right} y1={toY(tick)} y2={toY(tick)} stroke={GRID} />
                <text x={margin.left - 6} y={toY(tick) + 4} textAnchor="end" fontSize={11} fill={INK_MUTED}>
                  {!relative && metric === 'cost' ? `$${formatNumber(tick, 2)}` : formatNumber(tick, 2)}
                </text>
              </g>
            ))}
            <text x={(margin.left + width - margin.right) / 2} y={height - 6} textAnchor="middle" fontSize={12} fill={AXIS_LABEL_COLOR}>
              {xLabel} →
            </text>
            <text
              transform={`translate(12 ${(margin.top + plotBottom) / 2}) rotate(-90)`}
              textAnchor="middle"
              fontSize={12}
              fill={AXIS_LABEL_COLOR}
            >
              {narrow ? `${metric === 'cost' ? 'Cost' : 'Carbon'} →` : `${yLabel} →`}
            </text>

            {equalPenaltyLines.map((line, i) => (
              <path key={line.penalty} d={line.path} fill="none" stroke={NEUTRAL} strokeWidth={1.5} strokeDasharray="5 4">
                <title>{`Equal penalty${i === 0 ? ' (top pick)' : ''}: Z ≈ ${formatUsd(line.penalty)}`}</title>
              </path>
            ))}
            {front.length > 1 && (
              <polyline
                points={front.map((point) => `${toX(point.x).toFixed(1)},${toY(point.y).toFixed(1)}`).join(' ')}
                fill="none"
                stroke={ACCENT}
                strokeWidth={2}
                strokeLinejoin="round"
                opacity={0.6}
              />
            )}
            {pointsInDrawOrder.map((point) => {
              const isTopPick = point.material.rank === 1;
              const onPointer = showTooltip(point);
              return (
                <g key={point.material.materialId} onMouseMove={onPointer} onClick={onPointer}>
                  {/* Larger invisible circle as the hover target. */}
                  <circle cx={toX(point.x)} cy={toY(point.y)} r={12} fill="transparent" />
                  {/* The white stroke keeps overlapping dots apart. */}
                  <circle
                    cx={toX(point.x)}
                    cy={toY(point.y)}
                    r={isTopPick ? 7 : 5}
                    fill={point.onFront ? ACCENT : NEUTRAL}
                    stroke="#fff"
                    strokeWidth={2}
                  />
                  {isTopPick && <circle cx={toX(point.x)} cy={toY(point.y)} r={11} fill="none" stroke={ACCENT} strokeWidth={1.5} />}
                </g>
              );
            })}
            {points
              .filter((point) => labelledIds.has(point.material.materialId))
              .map((point) => {
                const x = toX(point.x);
                const labelOnRight = x < width * 0.65;
                return (
                  <text
                    key={`l${point.material.materialId}`}
                    x={labelOnRight ? x + 12 : x - 12}
                    y={toY(point.y) + 4}
                    textAnchor={labelOnRight ? 'start' : 'end'}
                    fontSize={11}
                    fill="#0f172a"
                    fontWeight={point.material.rank === 1 ? 600 : 400}
                    className="pointer-events-none"
                    paintOrder="stroke"
                    stroke="#fff"
                    strokeWidth={3}
                  >
                    {truncate(point.material.name, narrow ? 14 : 24)}
                  </text>
                );
              })}
          </svg>
          <ChartTooltip tooltip={tooltip} chartWidth={width} />
          <TradeoffLegend showEqualPenalty={equalPenaltyLines.length > 0} />
        </div>
      )}
    </div>
  );
}

function TradeoffLegend({ showEqualPenalty }: { showEqualPenalty: boolean }) {
  return (
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
      {showEqualPenalty && (
        <span className="flex items-center gap-1.5">
          <svg width="20" height="6" aria-hidden>
            <line x1="0" x2="20" y1="3" y2="3" stroke={NEUTRAL} strokeWidth="1.5" strokeDasharray="5 4" />
          </svg>
          Equal penalty (×1, ×2, ×4 of the top pick)
        </span>
      )}
    </div>
  );
}
