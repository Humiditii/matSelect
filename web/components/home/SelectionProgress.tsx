'use client';

import { useEffect, useState } from 'react';
import { Card, Spinner, cx } from '../ui';

const STAGES = [
  'Asking for candidate materials across all six families',
  'Checking the data is physically plausible',
  'Screening against your requirements',
  'Sizing the part and running 1,000 simulations',
  'Ranking and writing the explanation',
];

// Seconds after which each stage is expected to be done. With Claude, fetching candidates takes
// most of the minute; in demo mode the whole run is almost instant.
const STAGE_END_SECONDS_LIVE = [55, 58, 60, 62, 90];
const STAGE_END_SECONDS_DEMO = [0.4, 0.6, 0.8, 1, 1.4];

type StageState = 'done' | 'current' | 'waiting';

const STAGE_TEXT_STYLE: Record<StageState, string> = {
  done: 'text-slate-500',
  current: 'font-semibold text-slate-900',
  waiting: 'text-slate-400',
};

const STAGE_DOT_STYLE: Record<StageState, string> = {
  done: 'bg-emerald-500 text-white',
  current: 'bg-brand-600 text-white',
  waiting: 'bg-slate-200 text-slate-500',
};

/**
 * Shown while a selection runs. The server doesn't report progress, so the stages are an
 * estimate based on how long each one usually takes.
 */
export function SelectionProgress({ live }: { live: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const startedAt = Date.now();
    const timer = setInterval(() => setElapsed((Date.now() - startedAt) / 1000), 250);
    return () => clearInterval(timer);
  }, []);

  const stageEnds = live ? STAGE_END_SECONDS_LIVE : STAGE_END_SECONDS_DEMO;
  const firstUnfinished = stageEnds.findIndex((end) => elapsed < end);
  const currentStage = firstUnfinished === -1 ? STAGES.length - 1 : firstUnfinished;
  const progress = Math.min(0.95, elapsed / stageEnds[stageEnds.length - 1]);

  const stageState = (index: number): StageState => {
    if (index < currentStage) return 'done';
    return index === currentStage ? 'current' : 'waiting';
  };

  return (
    <Card className="mx-auto max-w-xl">
      <div className="flex items-center gap-3">
        <Spinner className="h-6 w-6 text-brand-600" />
        <div>
          <h2 className="text-lg font-semibold">Finding materials…</h2>
          <p className="text-sm text-slate-500">
            {live ? 'Usually 30–90 seconds.' : 'Demo mode — this is quick.'} {Math.floor(elapsed)} s elapsed
          </p>
        </div>
      </div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-brand-500 transition-all duration-500" style={{ width: `${progress * 100}%` }} />
      </div>
      <ol className="mt-5 space-y-2">
        {STAGES.map((stage, index) => {
          const state = stageState(index);
          return (
            <li key={stage} className={cx('flex items-center gap-3 text-sm', STAGE_TEXT_STYLE[state])}>
              <span
                className={cx('grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px]', STAGE_DOT_STYLE[state])}
                aria-hidden
              >
                {state === 'done' ? '✓' : index + 1}
              </span>
              {stage}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
