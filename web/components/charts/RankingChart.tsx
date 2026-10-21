'use client';

import { useState } from 'react';
import { FAMILY_LABEL, formatNumber, formatPercent, materialName } from '@/lib/labels';
import type { RankedMaterial, SelectionResult } from '@/lib/types';
import {
  ACCENT,
  ACCENT_SOFT,
  ChartTooltip,
  GRID,
  INK_MUTED,
  NARROW_WIDTH,
  TooltipContent,
  linearTicks,
  tooltipAt,
  truncate,
  useContainerWidth,
} from './chartHelpers';

const MAX_BARS = 12;
const VALUE_WIDTH = 72;
const ROW_HEIGHT = 30;
const BAR_HEIGHT = 16;
const TOP_PADDING = 8;
const AXIS_HEIGHT = 28;
const WHISKER_COLOR = '#334155';

/** One bar per material, with a whisker for the p10 to p90 range from the Monte Carlo runs. */
export function RankingChart({ result, format }: { result: SelectionResult; format: (value: number) => string }) {
  const { containerRef, container, width } = useContainerWidth();
  const [tooltip, setTooltip] = useState<TooltipContent | null>(null);
  const rows = result.ranking.slice(0, MAX_BARS);
  const higherIsBetter = result.objectiveUnit === '%';

  const labelWidth = Math.min(200, Math.round(width * 0.36));
  const plotWidth = Math.max(80, width - labelWidth - VALUE_WIDTH - 8);
  const maxValue = Math.max(...rows.map((row) => Math.max(row.objectiveValue, row.objectiveInterval[1])), 1e-12);
  const { ticks, top: axisMax } = linearTicks(maxValue, width < NARROW_WIDTH ? 3 : 5);
  const toX = (value: number) => labelWidth + (value / axisMax) * plotWidth;
  const height = TOP_PADDING + rows.length * ROW_HEIGHT + AXIS_HEIGHT;
  const plotBottom = height - AXIS_HEIGHT;
  const nameMaxChars = Math.max(10, Math.floor(labelWidth / 6.6));

  const showTooltip = (material: RankedMaterial) => (event: React.MouseEvent) => {
    const [low, high] = material.objectiveInterval;
    setTooltip(
      tooltipAt(event, container!, `${material.rank}. ${materialName(material)}`, [
        FAMILY_LABEL[material.family].label,
        `${format(material.objectiveValue)} (likely ${format(low)}–${format(high)})`,
        `Best in ${formatPercent(material.pBest)} of runs · top 3 in ${formatPercent(material.pTop3)}`,
      ]),
    );
  };

  return (
    <div>
      <p className="mb-2 text-sm text-slate-600">
        {result.objectiveLabel} — {higherIsBetter ? 'longer is better' : 'shorter is better'}. The thin line is the likely range
        (p10–p90) across {formatNumber(result.mcSamples)} Monte Carlo runs.
        {result.ranking.length > MAX_BARS && ` Top ${MAX_BARS} of ${result.ranking.length}.`}
      </p>
      <div ref={containerRef} className="relative" onMouseLeave={() => setTooltip(null)}>
        <svg width={width} height={height} role="img" aria-label={`Ranking chart: ${result.objectiveLabel}`} className="block">
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={toX(tick)} x2={toX(tick)} y1={TOP_PADDING} y2={plotBottom} stroke={GRID} />
              <text x={toX(tick)} y={plotBottom + 16} textAnchor="middle" fontSize={11} fill={INK_MUTED}>
                {format(tick)}
              </text>
            </g>
          ))}
          {rows.map((material, index) => {
            const rowTop = TOP_PADDING + index * ROW_HEIGHT;
            const centerY = rowTop + ROW_HEIGHT / 2;
            const barWidth = Math.max(2, toX(material.objectiveValue) - labelWidth);
            const straightPart = Math.max(0, barWidth - 4);
            const [low, high] = material.objectiveInterval;
            const isBest = material.rank === 1;
            const onPointer = showTooltip(material);
            return (
              <g key={material.materialId} onMouseMove={onPointer} onClick={onPointer} className="cursor-default">
                {/* Invisible rect so the whole row reacts to the pointer. */}
                <rect x={0} y={rowTop} width={width} height={ROW_HEIGHT} fill="transparent" />
                <text
                  x={labelWidth - 8}
                  y={centerY + 4}
                  textAnchor="end"
                  fontSize={12}
                  fill={isBest ? '#0f172a' : '#334155'}
                  fontWeight={isBest ? 600 : 400}
                >
                  {truncate(materialName(material), nameMaxChars)}
                </text>
                {/* Square at the baseline, rounded at the value end. */}
                <path
                  d={`M${labelWidth},${centerY - BAR_HEIGHT / 2} h${straightPart} a4,4 0 0 1 4,4 v${BAR_HEIGHT - 8} a4,4 0 0 1 -4,4 h${-straightPart} z`}
                  fill={isBest ? ACCENT : ACCENT_SOFT}
                />
                <line x1={toX(low)} x2={toX(high)} y1={centerY} y2={centerY} stroke={WHISKER_COLOR} strokeWidth={1.5} />
                {[low, high].map((value, end) => (
                  <line key={end} x1={toX(value)} x2={toX(value)} y1={centerY - 4} y2={centerY + 4} stroke={WHISKER_COLOR} strokeWidth={1.5} />
                ))}
                <text
                  x={Math.max(toX(material.objectiveValue), toX(high)) + 6}
                  y={centerY + 4}
                  fontSize={11}
                  fill={isBest ? '#0f172a' : INK_MUTED}
                  fontWeight={isBest ? 600 : 400}
                >
                  {format(material.objectiveValue)}
                </text>
              </g>
            );
          })}
          <line x1={labelWidth} x2={labelWidth} y1={TOP_PADDING} y2={plotBottom} stroke="#cbd5e1" />
        </svg>
        <ChartTooltip tooltip={tooltip} chartWidth={width} />
      </div>
    </div>
  );
}
