'use client';

import { openKeyDialog } from '@/lib/apiKey';
import { formatNumber } from '@/lib/labels';
import type { SelectionResult } from '@/lib/types';
import { ChartsCard } from './charts/ChartsCard';
import { ExcludedList } from './results/ExcludedList';
import { ExplanationPanel } from './results/ExplanationPanel';
import { IndexExpression } from './results/IndexExpression';
import { PickCard } from './results/PickCard';
import { PropertyTable } from './results/PropertyTable';
import { RankingTable } from './results/RankingTable';
import { formatObjective } from './results/objective';
import { WhereToBuy } from './WhereToBuy';
import { Banner, ButtonLink, Card, Collapsible } from './ui';

function Heading({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</p>;
}

function HowItWasRanked({ result }: { result: SelectionResult }) {
  // Some indices have two parts, e.g. "E/ρ and σ/ρ".
  const indexParts = result.index.expression.split(' and ');
  return (
    <Card title="How it was ranked">
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-3">
          <div>
            <Heading>Ranked by</Heading>
            <p className="text-slate-900">
              {result.objectiveLabel} <span className="text-slate-500">({result.objectiveUnit})</span>
            </p>
          </div>
          <div>
            <Heading>Material index</Heading>
            <p className="font-serif text-xl italic text-slate-900">
              {indexParts.map((part, i) => (
                <span key={part}>
                  {i > 0 && <span className="mx-2 font-sans text-sm not-italic text-slate-500">and</span>}
                  <IndexExpression expression={part} />
                </span>
              ))}
            </p>
            <p className="text-sm text-slate-600">{result.index.description}</p>
          </div>
          {result.mode === 'sizing' ? (
            <div>
              <Heading>Safety factor</Heading>
              <p className="text-slate-900">
                × {formatNumber(result.safetyFactor)}{' '}
                <span className="text-sm text-slate-500">— sizes use the weakest end of each property range</span>
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Conservative: each material is scored at the weak end of its property ranges.</p>
          )}
        </div>
        <div>
          <Heading>Requirements applied</Heading>
          <ul className="mt-1 space-y-1 text-sm text-slate-700">
            {result.activeConstraints.map((constraint, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden className="text-brand-600">•</span>
                {constraint}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="mt-4 text-xs text-slate-500">
        Ranking and fit are calculated, not chosen by the AI. Uncertainty: {formatNumber(result.mcSamples)} Monte Carlo runs, each property
        drawn log-uniformly within its range.
      </p>
    </Card>
  );
}

export function ResultsView({ result }: { result: SelectionResult }) {
  const notEvaluated = [...result.notEvaluated, ...result.invalidData];
  const topPicks = result.ranking.slice(0, 3);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-brand-700">Material selection</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{result.spec.title}</h1>
          <p className="mt-1 text-sm text-slate-600">
            <strong>{result.materials.length}</strong> candidates considered · <strong className="text-emerald-700">{result.ranking.length}</strong>{' '}
            fit · <strong className="text-rose-700">{result.rejected.length}</strong> ruled out · <strong>{notEvaluated.length}</strong> not
            evaluated
            {result.keySource === 'user' && <span className="ml-2 text-xs text-emerald-700">· 🔑 ran with your Claude key</span>}
          </p>
        </div>
        <div className="flex gap-2 [&>a]:flex-1 sm:[&>a]:flex-none">
          <ButtonLink href={`/?edit=${result.id}`} variant="secondary">
            ✏️ Change requirements
          </ButtonLink>
          <ButtonLink href="/">＋ New selection</ButtonLink>
        </div>
      </div>

      {result.dataSource === 'mock' && (
        <Banner tone="info" icon="🧪" title="Demo / mock data">
          <p>No Claude API key was available, so built-in demo materials and template explanations were used. The calculations are real.</p>
          <button className="font-semibold text-sky-800 underline" onClick={openKeyDialog}>
            Add your own Claude API key →
          </button>
        </Banner>
      )}
      {result.safetyNotes.map((note, i) => (
        <Banner key={i} tone="danger" icon="🦺" title="Safety">
          <p>{note}</p>
        </Banner>
      ))}
      {result.warnings.length > 0 && (
        <Banner tone="warn" title={result.warnings.length === 1 ? 'Note' : 'Notes'}>
          <ul className="list-disc space-y-1 pl-4">
            {result.warnings.map((warning, i) => (
              <li key={i}>{warning}</li>
            ))}
          </ul>
        </Banner>
      )}

      <HowItWasRanked result={result} />

      {topPicks.length > 0 ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Top picks</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {topPicks.map((ranked) => (
              <PickCard key={ranked.materialId} ranked={ranked} result={result} />
            ))}
          </div>
        </section>
      ) : (
        <Banner tone="danger" title="No material meets every requirement">
          <p>See “Ruled out” below for what blocked each one, then change the requirements.</p>
        </Banner>
      )}

      <ChartsCard result={result} format={(value) => formatObjective(result, value)} />

      <ExplanationPanel result={result} />

      <WhereToBuy result={result} />

      {result.ranking.length > 3 && <RankingTable result={result} />}

      <Collapsible title="Ruled out" count={result.rejected.length} defaultOpen>
        <ExcludedList items={result.rejected} emptyText="Nothing was ruled out." />
      </Collapsible>

      {notEvaluated.length > 0 && (
        <Collapsible title="Not evaluated" count={notEvaluated.length}>
          <p className="mb-3 text-sm text-slate-500">
            Missing or implausible AI data is never guessed or fixed — these materials were set aside instead.
          </p>
          <ExcludedList items={notEvaluated} emptyText="" />
        </Collapsible>
      )}

      <Collapsible title="Property data used" count={result.materials.length}>
        <PropertyTable result={result} />
      </Collapsible>
    </div>
  );
}
