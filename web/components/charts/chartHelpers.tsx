'use client';

import { useEffect, useState } from 'react';

// One accent colour for what matters (the top pick and the trade-off front) and a neutral for the rest.
export const ACCENT = '#1d5ef1'; // brand-600
export const ACCENT_SOFT = '#8ec3ff'; // brand-300
export const NEUTRAL = '#94a3b8'; // slate-400
export const GRID = '#e2e8f0'; // slate-200
export const INK_MUTED = '#64748b'; // slate-500

// Under this width the charts use fewer ticks and shorter labels.
export const NARROW_WIDTH = 480;

/**
 * Tracks the rendered width of a container, so the SVG is drawn at real pixel size
 * and its text stays readable on phones.
 */
export function useContainerWidth() {
  // A callback ref rather than useRef, so a container that remounts (after switching
  // back from the table view) gets observed again.
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry.contentRect.width)));
    observer.observe(container);
    return () => observer.disconnect();
  }, [container]);
  return { containerRef: setContainer, container, width };
}

// Rounds a raw step up to 1, 2 or 5 times a power of ten.
function niceStep(rawStep: number) {
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const fraction = rawStep / magnitude;
  if (fraction < 1.5) return magnitude;
  if (fraction < 3) return 2 * magnitude;
  if (fraction < 7) return 5 * magnitude;
  return 10 * magnitude;
}

export function linearTicks(max: number, count: number) {
  const step = niceStep(max / count);
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let tick = 0; tick <= top + step / 2; tick += step) ticks.push(tick);
  return { ticks, top };
}

export function logTicks(min: number, max: number) {
  const lowPower = Math.floor(Math.log10(min));
  const highPower = Math.ceil(Math.log10(max));
  // Add 2× and 5× ticks when the axis spans only a couple of decades.
  const multipliers = highPower - lowPower <= 2 ? [1, 2, 5] : [1];
  const ticks: number[] = [];
  for (let power = lowPower; power <= highPower; power++) {
    for (const multiplier of multipliers) ticks.push(multiplier * 10 ** power);
  }
  const low = 10 ** lowPower;
  const high = 10 ** highPower;
  return { ticks: ticks.filter((tick) => tick >= low && tick <= high), low, high };
}

export const truncate = (text: string, maxLength: number) => (text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text);

export interface TooltipContent {
  x: number;
  y: number;
  title: string;
  lines: string[];
}

/** Places the tooltip next to the pointer, relative to the chart container. */
export function tooltipAt(event: React.MouseEvent, container: HTMLElement, title: string, lines: string[]): TooltipContent {
  const box = container.getBoundingClientRect();
  return { x: event.clientX - box.left, y: event.clientY - box.top + 12, title, lines };
}

export function ChartTooltip({ tooltip, chartWidth }: { tooltip: TooltipContent | null; chartWidth: number }) {
  if (!tooltip) return null;
  const left = Math.min(Math.max(tooltip.x + 12, 0), chartWidth - 220);
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 w-52 rounded-lg bg-white p-2.5 text-xs shadow-lg ring-1 ring-slate-200"
      style={{ left, top: Math.max(tooltip.y - 12, 0) }}
    >
      <p className="font-semibold text-slate-900">{tooltip.title}</p>
      {tooltip.lines.map((line) => (
        <p key={line} className="text-slate-600">
          {line}
        </p>
      ))}
    </div>
  );
}
