import { CONFIDENCE_STYLE, PROCESS_LABEL, RATING_LEVEL_STYLE, formatNumber, formatPercent, formatUsd } from '@/lib/labels';
import type { Process, ProcessRating, RankedMaterial, SelectionResult } from '@/lib/types';
import { Badge, cx } from '../ui';
import { FamilyBadge } from './FamilyBadge';
import { FootprintDetails } from './FootprintDetails';
import { formatObjective, objectiveName } from './objective';

const MEDALS = ['🥇', '🥈', '🥉'];

// Reasons the card already shows as its own fields (size, cost, chances, footprint), so we hide them from the list.
const REASON_SHOWN_ELSEWHERE =
  /^(Needs a |Material cost about |Best choice in |Carbon footprint about |Sustainability: |Contains EU critical raw materials|Easy to work|Moderately easy to work|Hard to work)/;

function ProcessFitBadges({ processFit }: { processFit: Partial<Record<Process, ProcessRating>> }) {
  const entries = Object.entries(processFit) as [Process, ProcessRating][];
  if (!entries.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([process, rating]) => (
        <Badge key={process} className={RATING_LEVEL_STYLE[rating]} title={`${PROCESS_LABEL[process]}: ${rating}`}>
          {PROCESS_LABEL[process]} · {rating}
        </Badge>
      ))}
    </div>
  );
}

function ChanceMeter({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs text-slate-500">
        <span>{label}</span>
        <span className="font-semibold text-slate-700">{formatPercent(value)}</span>
      </div>
      <div
        className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"
        role="meter"
        aria-valuenow={Math.round(value * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${Math.max(2, value * 100)}%` }} />
      </div>
    </div>
  );
}

export function PickCard({ ranked, result }: { ranked: RankedMaterial; result: SelectionResult }) {
  const isBest = ranked.rank === 1;
  const material = result.materials.find((m) => m.id === ranked.materialId);
  const sources = material?.sources ?? [];
  const [likelyLow, likelyHigh] = ranked.objectiveInterval;
  const reasons = ranked.reasons.filter((reason) => !REASON_SHOWN_ELSEWHERE.test(reason));

  return (
    <article
      className={cx(
        'animate-fade-in flex flex-col rounded-2xl border bg-white p-4 shadow-sm transition hover:shadow-md sm:p-5',
        isBest ? 'border-brand-300 ring-2 ring-brand-500/40' : 'border-slate-200',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <FamilyBadge family={ranked.family} />
          <Badge className={CONFIDENCE_STYLE[ranked.confidence]} title="How sure the AI is about this material's data">
            {ranked.confidence} confidence
          </Badge>
        </div>
        <span className="text-2xl" aria-label={`Rank ${ranked.rank}`}>
          {MEDALS[ranked.rank - 1]}
        </span>
      </div>
      <h3 className="mt-2 text-lg font-bold leading-snug text-slate-900">{ranked.name}</h3>
      {ranked.grade && <p className="text-sm text-slate-500">{ranked.grade}</p>}

      <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3">
        <div>
          <p className="text-xs text-slate-500">{objectiveName(result).full}</p>
          <p className="text-xl font-bold text-slate-900">{formatObjective(result, ranked.objectiveValue)}</p>
          <p className="text-xs text-slate-500" title="10th–90th percentile across the Monte Carlo simulations">
            likely {formatObjective(result, likelyLow)}–{formatObjective(result, likelyHigh)}
          </p>
        </div>
        <div className="space-y-2">
          <ChanceMeter value={ranked.pBest} label="Chance it's the best" />
          <ChanceMeter value={ranked.pTop3} label="Chance in top 3" />
        </div>
      </div>

      {ranked.sizing && (
        <dl className="mt-3 space-y-1 text-sm">
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-slate-500">Size</dt>
            <dd className="font-medium text-slate-900">{ranked.sizing.dimension}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-slate-500">Mass</dt>
            <dd className="text-slate-900">{formatNumber(ranked.sizing.massKg)} kg</dd>
          </div>
          {ranked.sizing.costUsd && (
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-slate-500">Cost</dt>
              <dd className="text-slate-900">
                {formatUsd(ranked.sizing.costUsd[0])}–{formatUsd(ranked.sizing.costUsd[1])} <span className="text-slate-500">material</span>
              </dd>
            </div>
          )}
        </dl>
      )}

      <FootprintDetails material={ranked} hazards={material?.hazards ?? []} />

      <ul className="mt-3 space-y-1 text-sm text-slate-700">
        {reasons.map((reason, i) => (
          <li key={i} className="flex gap-2">
            <span aria-hidden className="text-emerald-600">✓</span>
            <span>{reason}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto space-y-2 pt-3">
        <ProcessFitBadges processFit={ranked.processFit} />
        {sources.length > 0 && (
          <details className="text-xs text-slate-500">
            <summary className="cursor-pointer select-none hover:text-slate-700">📚 References ({sources.length})</summary>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {sources.map((source, i) => (
                <li key={i}>{source}</li>
              ))}
            </ul>
            <p className="mt-1 italic">Recalled by the AI — check them before relying on the values.</p>
          </details>
        )}
        {ranked.dataFlags.map((flag, i) => (
          <p key={i} className="rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-900">
            ⚠️ {flag}
          </p>
        ))}
      </div>
    </article>
  );
}
