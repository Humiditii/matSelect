'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '@/lib/api';
import { openKeyDialog } from '@/lib/apiKey';
import {
  AUDIENCE_LABEL,
  CONFIDENCE_STYLE,
  FAMILY_LABEL,
  PROCESS_LABEL,
  PROCESS_RATING_STYLE,
  RATING_STYLE,
  fmt,
  fmtRange,
  fmtUsd,
  materialName,
  pct,
} from '@/lib/labels';
import { AUDIENCES, Audience, Explanation, Family, Process, ProcessRating, RankedMaterial, SelectionResult } from '@/lib/types';
import { Badge, Banner, ButtonLink, Card, Collapsible, Segmented, Spinner, cx } from './ui';

function objectiveText(r: SelectionResult, x: number): string {
  if (r.objectiveUnit === 'kg') return `${fmt(x)} kg`;
  if (r.objectiveUnit === 'USD') return fmtUsd(x);
  return `${fmt(x)}%`;
}

function FamilyBadge({ family }: { family: Family }) {
  const f = FAMILY_LABEL[family];
  return (
    <Badge className={f.color}>
      <span aria-hidden>{f.icon}</span> {f.label}
    </Badge>
  );
}

function ToolBadges({ fit }: { fit: Partial<Record<Process, ProcessRating>> }) {
  const entries = Object.entries(fit) as [Process, ProcessRating][];
  if (!entries.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([p, r]) => (
        <Badge key={p} className={PROCESS_RATING_STYLE[r]} title={`${PROCESS_LABEL[p]}: ${r}`}>
          {PROCESS_LABEL[p]} · {r}
        </Badge>
      ))}
    </div>
  );
}

/** Horizontal bar showing pBest — a simple meter, not a chart. */
function Meter({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs text-slate-500">
        <span>{label}</span>
        <span className="font-semibold text-slate-700">{pct(value)}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100" role="meter" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${Math.max(2, value * 100)}%` }} />
      </div>
    </div>
  );
}

/** Reasons already shown as structured fields on the card (size, cost, probabilities). */
const DUPLICATED_REASON = /^(Needs a |Material cost about |Best choice in )/;

/** Render "E^(1/2)/ρ" with real superscripts. */
export function IndexExpr({ expr }: { expr: string }) {
  const parts = expr.split(/\^(\([^)]*\)|-?\d+)/);
  return (
    <span>
      {parts.map((p, i) => (i % 2 ? <sup key={i}>{p.replace(/[()]/g, '')}</sup> : <span key={i}>{p}</span>))}
    </span>
  );
}

function PickCard({ r, res, best }: { r: RankedMaterial; res: SelectionResult; best: boolean }) {
  const medal = ['🥇', '🥈', '🥉'][r.rank - 1];
  const sources = res.materials.find((m) => m.id === r.materialId)?.sources ?? [];
  return (
    <article
      className={cx(
        'animate-fade-in flex flex-col rounded-2xl border bg-white p-4 shadow-sm transition hover:shadow-md sm:p-5',
        best ? 'border-brand-300 ring-2 ring-brand-500/40' : 'border-slate-200',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <FamilyBadge family={r.family} />
          <Badge className={CONFIDENCE_STYLE[r.confidence]} title="How sure the AI is about this material's data">
            {r.confidence} confidence
          </Badge>
        </div>
        <span className="text-2xl" aria-label={`Rank ${r.rank}`}>
          {medal}
        </span>
      </div>
      <h3 className="mt-2 text-lg font-bold leading-snug text-slate-900">{r.name}</h3>
      {r.grade && <p className="text-sm text-slate-500">{r.grade}</p>}

      <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3">
        <div>
          <p className="text-xs text-slate-500">{res.mode === 'sizing' ? (res.objectiveUnit === 'USD' ? 'Material cost' : 'Part mass') : 'Index score'}</p>
          <p className="text-xl font-bold text-slate-900">{objectiveText(res, r.objectiveValue)}</p>
          <p className="text-xs text-slate-500" title="10th–90th percentile across the Monte Carlo simulations">
            likely {objectiveText(res, r.objectiveInterval[0])}–{objectiveText(res, r.objectiveInterval[1])}
          </p>
        </div>
        <div className="space-y-2">
          <Meter value={r.pBest} label="Chance it's the best" />
          <Meter value={r.pTop3} label="Chance in top 3" />
        </div>
      </div>

      {r.sizing && (
        <dl className="mt-3 space-y-1 text-sm">
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-slate-500">Size</dt>
            <dd className="font-medium text-slate-900">{r.sizing.dimension}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-slate-500">Mass</dt>
            <dd className="text-slate-900">{fmt(r.sizing.massKg)} kg</dd>
          </div>
          {r.sizing.costUsd && (
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-slate-500">Cost</dt>
              <dd className="text-slate-900">
                {fmtUsd(r.sizing.costUsd[0])}–{fmtUsd(r.sizing.costUsd[1])} <span className="text-slate-500">material</span>
              </dd>
            </div>
          )}
        </dl>
      )}

      <ul className="mt-3 space-y-1 text-sm text-slate-700">
        {r.reasons.filter((x) => !DUPLICATED_REASON.test(x)).map((x, i) => (
          <li key={i} className="flex gap-2">
            <span aria-hidden className="text-emerald-600">✓</span>
            <span>{x}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto space-y-2 pt-3">
        <ToolBadges fit={r.processFit} />
        {sources.length > 0 && (
          <details className="text-xs text-slate-500">
            <summary className="cursor-pointer select-none hover:text-slate-700">📚 References ({sources.length})</summary>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {sources.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
            <p className="mt-1 italic">Recalled by the AI — check them before relying on the values.</p>
          </details>
        )}
        {r.dataFlags.map((f, i) => (
          <p key={i} className="rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-900">
            ⚠️ {f}
          </p>
        ))}
      </div>
    </article>
  );
}

function ExplanationPanel({ res }: { res: SelectionResult }) {
  const [audience, setAudience] = useState<Audience>(res.spec.audience);
  const [cache, setCache] = useState<Partial<Record<Audience, Explanation>>>(res.explanations ?? {});
  const [loading, setLoading] = useState<Audience | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requested = useRef(new Set<Audience>());

  useEffect(() => {
    if (cache[audience] || requested.current.has(audience)) return;
    requested.current.add(audience);
    setLoading(audience);
    setError(null);
    api
      .explain(res.id, audience)
      .then((e) => setCache((c) => ({ ...c, [audience]: e })))
      .catch((e: Error & { status?: number }) => {
        requested.current.delete(audience);
        setError(e.message);
        if (e.status === 401 || e.status === 403) openKeyDialog();
      })
      .finally(() => setLoading((l) => (l === audience ? null : l)));
  }, [audience, cache, res.id]);

  const ex = cache[audience];
  return (
    <Card
      title="Explanation"
      subtitle="Written for you from the calculation above."
      action={
        <Segmented
          size="sm"
          value={audience}
          disabled={loading !== null}
          onChange={setAudience}
          options={AUDIENCES.map((a) => ({ value: a, label: `${AUDIENCE_LABEL[a].icon} ${AUDIENCE_LABEL[a].label}`, title: AUDIENCE_LABEL[a].hint }))}
        />
      }
    >
      {loading === audience && !ex && (
        <div className="flex items-center gap-3 py-8 text-sm text-slate-500">
          <Spinner /> Writing the {AUDIENCE_LABEL[audience].label.toLowerCase()} explanation…
        </div>
      )}
      {error && !ex && (
        <Banner tone="danger" title="Couldn’t write this explanation">
          <p>{error}</p>
          <button
            className="font-semibold underline"
            onClick={() => {
              setError(null);
              setCache((c) => ({ ...c }));
            }}
          >
            Try again
          </button>
        </Banner>
      )}
      {ex && (
        <div className="animate-fade-in">
          {ex.grounded ? (
            <Badge className="mb-4 bg-emerald-50 text-emerald-700 ring-emerald-200">✓ Every number checked against the calculation</Badge>
          ) : (
            <div className="mb-4">
              <Banner tone="warn" title="Some numbers could not be verified">
                <p>
                  These numbers in the text don’t match the calculation: <strong>{ex.unverifiedNumbers.join(', ')}</strong>. Trust the cards and tables above.
                </p>
              </Banner>
            </div>
          )}
          <div className="prose prose-slate max-w-none prose-headings:mb-2 prose-headings:mt-5 prose-h2:text-lg prose-p:my-2 prose-blockquote:border-rose-300 prose-blockquote:bg-rose-50 prose-blockquote:py-1 prose-blockquote:not-italic prose-li:my-0.5">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{ex.text}</ReactMarkdown>
          </div>
        </div>
      )}
    </Card>
  );
}

function ExcludedList({ items, empty }: { items: SelectionResult['rejected']; empty: string }) {
  const [all, setAll] = useState(false);
  const [q, setQ] = useState('');
  const filtered = items.filter((x) => `${x.name} ${x.grade ?? ''} ${x.reasons.join(' ')}`.toLowerCase().includes(q.toLowerCase()));
  const shown = all || q ? filtered : filtered.slice(0, 8);
  if (!items.length) return <p className="text-sm text-slate-500">{empty}</p>;
  return (
    <div>
      {items.length > 8 && (
        <input
          className="mb-3 block w-full rounded-xl border-0 px-3 py-2 text-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-brand-500 sm:max-w-xs"
          placeholder="Search materials or reasons…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      )}
      <ul className="divide-y divide-slate-100">
        {shown.map((x) => (
          <li key={x.materialId} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:gap-4">
            <div className="flex shrink-0 items-start gap-2 sm:w-72">
              <span className="font-medium text-slate-900">{materialName(x)}</span>
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <div>
                <FamilyBadge family={x.family} />
              </div>
              <ul className="text-sm text-slate-600">
                {x.reasons.map((r, i) => (
                  <li key={i} className="flex gap-2">
                    <span aria-hidden className="text-rose-500">✕</span>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          </li>
        ))}
      </ul>
      {!q && filtered.length > 8 && (
        <button className="mt-2 text-sm font-semibold text-brand-700 hover:underline" onClick={() => setAll((a) => !a)}>
          {all ? 'Show fewer' : `Show all ${filtered.length}`}
        </button>
      )}
    </div>
  );
}

function RatingCell({ r }: { r: string | null }) {
  return r ? <span className={cx('inline-block w-6 rounded text-center text-xs font-bold', RATING_STYLE[r])}>{r}</span> : <span className="text-slate-300">—</span>;
}

export function ResultsView({ res }: { res: SelectionResult }) {
  const counts = {
    considered: res.materials.length,
    fit: res.ranking.length,
    out: res.rejected.length,
    ne: res.notEvaluated.length + res.invalidData.length,
  };
  const top3 = res.ranking.slice(0, 3);
  const [familyFilter, setFamilyFilter] = useState<Family | 'all'>('all');
  const fitIds = useMemo(() => new Set(res.ranking.map((r) => r.materialId)), [res.ranking]);
  const tableMaterials = res.materials.filter((m) => familyFilter === 'all' || m.family === familyFilter);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-brand-700">Material selection</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{res.spec.title}</h1>
          <p className="mt-1 text-sm text-slate-600">
            <strong>{counts.considered}</strong> candidates considered · <strong className="text-emerald-700">{counts.fit}</strong> fit ·{' '}
            <strong className="text-rose-700">{counts.out}</strong> ruled out · <strong>{counts.ne}</strong> not evaluated
            {res.keySource === 'user' && <span className="ml-2 text-xs text-emerald-700">· 🔑 ran with your Claude key</span>}
          </p>
        </div>
        <div className="flex gap-2 [&>a]:flex-1 sm:[&>a]:flex-none">
          <ButtonLink href={`/?edit=${res.id}`} variant="secondary">
            ✏️ Change requirements
          </ButtonLink>
          <ButtonLink href="/">＋ New selection</ButtonLink>
        </div>
      </div>

      {/* Banners */}
      {res.dataSource === 'mock' && (
        <Banner tone="info" icon="🧪" title="Demo / mock data">
          <p>No Claude API key was available, so built-in demo materials and template explanations were used. The calculations are real.</p>
          <button className="font-semibold text-sky-800 underline" onClick={openKeyDialog}>
            Add your own Claude API key →
          </button>
        </Banner>
      )}
      {res.safetyNotes.map((n, i) => (
        <Banner key={i} tone="danger" icon="🦺" title="Safety">
          <p>{n}</p>
        </Banner>
      ))}
      {res.warnings.length > 0 && (
        <Banner tone="warn" title={res.warnings.length === 1 ? 'Note' : 'Notes'}>
          <ul className="list-disc space-y-1 pl-4">
            {res.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Banner>
      )}

      {/* How it was ranked */}
      <Card title="How it was ranked">
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ranked by</p>
              <p className="text-slate-900">
                {res.objectiveLabel} <span className="text-slate-500">({res.objectiveUnit})</span>
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Material index</p>
              <p className="font-serif text-xl italic text-slate-900">
                {res.index.expression.split(' and ').map((e, i) => (
                  <span key={e}>
                    {i > 0 && <span className="mx-2 font-sans text-sm not-italic text-slate-500">and</span>}
                    <IndexExpr expr={e} />
                  </span>
                ))}
              </p>
              <p className="text-sm text-slate-600">{res.index.description}</p>
            </div>
            {res.mode === 'sizing' ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Safety factor</p>
                <p className="text-slate-900">
                  × {fmt(res.safetyFactor)} <span className="text-sm text-slate-500">— sizes use the weakest end of each property range</span>
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Conservative: each material is scored at the weak end of its property ranges.</p>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Requirements applied</p>
            <ul className="mt-1 space-y-1 text-sm text-slate-700">
              {res.activeConstraints.map((c, i) => (
                <li key={i} className="flex gap-2">
                  <span aria-hidden className="text-brand-600">•</span>
                  {c}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-4 text-xs text-slate-500">
          Ranking and fit are calculated, not chosen by the AI. Uncertainty: {fmt(res.mcSamples)} Monte Carlo runs, each property drawn log-uniformly within its range.
        </p>
      </Card>

      {/* Top picks */}
      {top3.length > 0 ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Top picks</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {top3.map((r) => (
              <PickCard key={r.materialId} r={r} res={res} best={r.rank === 1} />
            ))}
          </div>
        </section>
      ) : (
        <Banner tone="danger" title="No material meets every requirement">
          <p>See “Ruled out” below for what blocked each one, then change the requirements.</p>
        </Banner>
      )}

      <ExplanationPanel res={res} />

      {/* All that fit */}
      {res.ranking.length > 3 && (
        <Card title="All materials that fit" subtitle={`${res.ranking.length} materials, best first`}>
          <div className="-mx-4 overflow-x-auto sm:-mx-6">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 sm:pl-6">#</th>
                  <th className="px-3 py-2">Material</th>
                  <th className="px-3 py-2">{res.mode === 'sizing' ? (res.objectiveUnit === 'USD' ? 'Cost' : 'Mass') : 'Score'}</th>
                  <th className="px-3 py-2">Likely (p10–p90)</th>
                  {res.mode === 'sizing' && <th className="px-3 py-2">Size</th>}
                  <th className="px-3 py-2 sm:pr-6">Best / top 3</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {res.ranking.map((r) => (
                  <tr key={r.materialId} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-semibold text-slate-500 sm:pl-6">{r.rank}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-900">{materialName(r)}</div>
                      <div className="text-xs text-slate-500">{FAMILY_LABEL[r.family].label}</div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-semibold">{objectiveText(res, r.objectiveValue)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                      {objectiveText(res, r.objectiveInterval[0])}–{objectiveText(res, r.objectiveInterval[1])}
                    </td>
                    {res.mode === 'sizing' && <td className="min-w-48 px-3 py-2 text-slate-600">{r.sizing?.dimension}</td>}
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600 sm:pr-6">
                      {pct(r.pBest)} / {pct(r.pTop3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Collapsible title="Ruled out" count={res.rejected.length} defaultOpen>
        <ExcludedList items={res.rejected} empty="Nothing was ruled out." />
      </Collapsible>

      {counts.ne > 0 && (
        <Collapsible title="Not evaluated" count={counts.ne}>
          <p className="mb-3 text-sm text-slate-500">Missing or implausible AI data is never guessed or fixed — these materials were set aside instead.</p>
          <ExcludedList items={[...res.notEvaluated, ...res.invalidData]} empty="" />
        </Collapsible>
      )}

      <Collapsible title="Property data used" count={res.materials.length}>
        <p className="mb-3 text-sm text-slate-600">
          AI-estimated typical ranges ({res.dataSource === 'mock' ? 'built-in demo data' : 'from Claude'}). Verify with supplier datasheets before buying.
        </p>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {(['all', ...Object.keys(FAMILY_LABEL)] as (Family | 'all')[]).map((f) => (
            <button
              key={f}
              onClick={() => setFamilyFilter(f)}
              className={cx(
                'rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset',
                familyFilter === f ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50',
              )}
            >
              {f === 'all' ? 'All' : FAMILY_LABEL[f].label}
            </button>
          ))}
        </div>
        <div className="-mx-4 overflow-x-auto sm:-mx-6">
          <table className="min-w-full text-left text-xs">
            <thead className="border-b border-slate-200 uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 sm:pl-6">Material</th>
                <th className="px-2 py-2">Density kg/m³</th>
                <th className="px-2 py-2">E GPa</th>
                <th className="px-2 py-2">Strength MPa</th>
                <th className="px-2 py-2">Max °C</th>
                <th className="px-2 py-2">Price $/kg</th>
                <th className="px-2 py-2">Water</th>
                <th className="px-2 py-2">UV</th>
                {res.spec.customProperties?.map((cp) => (
                  <th key={cp.key} className="px-2 py-2 normal-case">
                    {cp.label}
                    {cp.unit && <span className="block font-normal text-slate-400">{cp.unit}</span>}
                  </th>
                ))}
                {res.spec.customEnvironments?.map((e) => (
                  <th key={e} className="max-w-28 px-2 py-2 normal-case" title={e}>
                    “{e.length > 18 ? `${e.slice(0, 17)}…` : e}”
                  </th>
                ))}
                <th className="px-2 py-2">Conf.</th>
                <th className="px-2 py-2 sm:pr-6">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tableMaterials.map((m) => (
                <tr key={m.id} className={cx('align-top', fitIds.has(m.id) && 'bg-emerald-50/40')}>
                  <td className="min-w-44 px-4 py-2 sm:pl-6">
                    <div className="font-medium text-slate-900">
                      {fitIds.has(m.id) && <span title="Fits every requirement">✅ </span>}
                      {m.name}
                    </div>
                    <div className="text-slate-500">{[m.grade, FAMILY_LABEL[m.family].label].filter(Boolean).join(' · ')}</div>
                  </td>
                  <td className="whitespace-nowrap px-2 py-2">{fmtRange(m.density)}</td>
                  <td className="whitespace-nowrap px-2 py-2">{fmtRange(m.E)}</td>
                  <td className="whitespace-nowrap px-2 py-2">{fmtRange(m.strength)}</td>
                  <td className="whitespace-nowrap px-2 py-2">{fmtRange(m.tMax)}</td>
                  <td className="whitespace-nowrap px-2 py-2">{fmtRange(m.price)}</td>
                  <td className="px-2 py-2">
                    <RatingCell r={m.ratings.fresh_water} />
                  </td>
                  <td className="px-2 py-2">
                    <RatingCell r={m.ratings.uv} />
                  </td>
                  {res.spec.customProperties?.map((cp) => (
                    <td key={cp.key} className="whitespace-nowrap px-2 py-2">
                      {fmtRange(m.extra?.[cp.key] ?? null)}
                    </td>
                  ))}
                  {res.spec.customEnvironments?.map((e) => (
                    <td key={e} className="px-2 py-2">
                      <RatingCell r={m.customRatings?.[e.trim().toLowerCase().replace(/\s+/g, ' ')] ?? null} />
                    </td>
                  ))}
                  <td className="px-2 py-2">
                    <Badge className={CONFIDENCE_STYLE[m.confidence]}>{m.confidence}</Badge>
                  </td>
                  <td className="min-w-64 px-2 py-2 text-slate-600 sm:pr-6">{m.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          Ratings:
          {['A', 'B', 'C', 'D', 'E'].map((r, i) => (
            <span key={r} className="flex items-center gap-1">
              <RatingCell r={r} /> {['excellent', 'good', 'average', 'poor', 'unacceptable'][i]}
            </span>
          ))}
          <span>· “—” = unknown (never guessed)</span>
        </p>
      </Collapsible>
    </div>
  );
}
