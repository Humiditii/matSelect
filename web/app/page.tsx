'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { BriefEditor } from '@/components/BriefEditor';
import { CustomEnvInput, SpecEditor } from '@/components/SpecEditor';
import { Banner, Button, Card, Segmented, Spinner, cx } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { openKeyDialog } from '@/lib/apiKey';
import { AUDIENCE_LABEL, COMPONENT_LABEL, EXAMPLES } from '@/lib/labels';
import { AUDIENCES, Audience, DesignSpec, Question, SelectionSummary } from '@/lib/types';

type Step = 'describe' | 'confirm' | 'running';

const SIZED = ['beam', 'tie', 'column', 'shaft'];
const QUANTITY_FIELDS = ['load', 'length', 'maxDeflection', 'sectionWidth'];

/** Write a clarifying-question answer into the spec field (no second Claude call). */
function applyAnswer(spec: DesignSpec, field: string, value: unknown): DesignSpec {
  if (!(field in spec)) return spec;
  if (QUANTITY_FIELDS.includes(field)) {
    const q = value as { value?: number; unit?: string } | null;
    const next = { ...spec, [field]: q && typeof q.value === 'number' && q.unit ? { value: q.value, unit: q.unit } : null };
    // A beam that must "not bend too much" needs a bending limit; once the span is known, default to span/200 (visible, removable).
    if (field === 'length' && next.length && next.component === 'beam' && next.criteria.includes('stiffness') && !next.maxDeflection) {
      const spanMm = next.length.value * ({ mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 }[next.length.unit] ?? 1000);
      const mm = Math.round((spanMm / 200) * 10) / 10;
      next.maxDeflection = { value: mm, unit: 'mm' };
      next.assumptions = [...next.assumptions, `Allowed bending ${mm} mm (span/200, a common limit so it doesn't visibly sag).`];
    }
    return next;
  }
  if (field === 'tempRangeC' && value && !Array.isArray(value)) {
    const r = value as { min: number; max: number };
    return { ...spec, tempRangeC: [r.min, r.max] };
  }
  return { ...spec, [field]: value } as DesignSpec;
}

/** Client-side checks that mirror the API's validation, so problems show before the long run. */
function specProblems(s: DesignSpec): string[] {
  const p: string[] = [];
  if (!s.title.trim()) p.push('Give the part a name.');
  if (!s.criteria.length && s.component !== 'custom') p.push('Choose at least one of “not bend too much” / “not break”.');
  if (s.tempRangeC && s.tempRangeC[0] > s.tempRangeC[1]) p.push('The coldest temperature is above the hottest.');
  if (s.safetyFactor !== null && s.safetyFactor < 1) p.push('The safety factor must be at least 1.');
  if (s.section === 'round_tube' || s.section === 'square_tube') if (s.tubeRatio < 2.5) p.push('Tube outer size ÷ wall must be at least 2.5.');
  return p;
}

// ---------------------------------------------------------------------------
const STAGES = [
  'Asking for candidate materials across all six families',
  'Checking the data is physically plausible',
  'Screening against your requirements',
  'Sizing the part and running 1,000 simulations',
  'Ranking and writing the explanation',
];

function Progress({ live }: { live: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t0 = Date.now();
    const id = setInterval(() => setElapsed((Date.now() - t0) / 1000), 250);
    return () => clearInterval(id);
  }, []);
  // Expected durations: ~60 s with real Claude (candidates dominate), a moment in demo mode.
  const ends = live ? [55, 58, 60, 62, 90] : [0.4, 0.6, 0.8, 1, 1.4];
  const stage = Math.min(ends.findIndex((e) => elapsed < e) === -1 ? STAGES.length - 1 : ends.findIndex((e) => elapsed < e), STAGES.length - 1);
  const progress = Math.min(0.95, elapsed / ends[ends.length - 1]);
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
        {STAGES.map((s, i) => (
          <li key={s} className={cx('flex items-center gap-3 text-sm', i < stage ? 'text-slate-500' : i === stage ? 'font-semibold text-slate-900' : 'text-slate-400')}>
            <span
              className={cx(
                'grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px]',
                i < stage ? 'bg-emerald-500 text-white' : i === stage ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-500',
              )}
              aria-hidden
            >
              {i < stage ? '✓' : i + 1}
            </span>
            {s}
          </li>
        ))}
      </ol>
    </Card>
  );
}

// ---------------------------------------------------------------------------
function QuestionCard({
  q,
  answered,
  onAnswer,
  onOther,
}: {
  q: Question;
  answered: string | undefined;
  onAnswer: (label: string, value: unknown) => void;
  /** Free-text answer, offered for environment questions. */
  onOther?: (text: string) => void;
}) {
  return (
    <div className={cx('animate-fade-in rounded-2xl border p-4 transition', answered ? 'border-emerald-200 bg-emerald-50/60' : 'border-brand-200 bg-brand-50/60')}>
      <p className="flex items-start gap-2 font-medium text-slate-900">
        <span aria-hidden>{answered ? '✅' : '❓'}</span>
        {q.question}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {q.options.map((o) => (
          <button
            key={o.label}
            type="button"
            onClick={() => onAnswer(o.label, o.value)}
            className={cx(
              'rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset transition',
              answered === o.label ? 'bg-emerald-600 text-white ring-emerald-600' : 'bg-white text-slate-700 ring-slate-300 hover:ring-brand-400',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      {onOther && <CustomEnvInput compact values={[]} onChange={(v) => v[0] && onOther(v[0])} />}
    </div>
  );
}

function RecentList({ items }: { items: SelectionSummary[] }) {
  if (!items.length) return null;
  return (
    <section className="mt-10">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Recent selections</h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.slice(0, 9).map((s) => (
          <li key={s.id}>
            <Link href={`/results/${s.id}`} className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-300 hover:shadow-md">
              <p className="font-semibold text-slate-900">{s.title}</p>
              <p className="mt-1 text-sm text-slate-600">{s.topPick ? <>🥇 {s.topPick}</> : 'No material fitted'}</p>
              <p className="mt-2 text-xs text-slate-400">
                {new Date(s.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} · {s.candidates} candidates
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
function Home() {
  const router = useRouter();
  const params = useSearchParams();
  const editId = params.get('edit');
  const prefill = params.get('q');

  const [step, setStep] = useState<Step>('describe');
  const [text, setText] = useState('');
  const [audience, setAudience] = useState<Audience>('everyday');
  const [spec, setSpec] = useState<DesignSpec | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answered, setAnswered] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; issues: { path: string; message: string }[] } | null>(null);
  const [recent, setRecent] = useState<SelectionSummary[]>([]);
  const [live, setLive] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // /?q=… (e.g. "Try it" on the tutorial) pre-fills the description.
  useEffect(() => {
    if (prefill && !editId) {
      setText(prefill.slice(0, 2000));
      setStep('describe');
    }
  }, [prefill, editId]);

  useEffect(() => {
    api.listSelections().then(setRecent).catch(() => undefined);
    api.health().then((h) => setLive(h.llmProvider === 'anthropic')).catch(() => undefined);
  }, []);

  // /?edit=<id> → load that selection's spec into Confirm. Leaving edit mode (e.g. via the logo) resets the flow.
  const loadedEdit = useRef<string | null>(null);
  useEffect(() => {
    if (!editId) {
      if (loadedEdit.current) {
        loadedEdit.current = null;
        setSpec(null);
        setText('');
        setError(null);
        setStep('describe');
      }
      return;
    }
    loadedEdit.current = editId;
    setBusy(true);
    api
      .getSelection(editId)
      .then((r) => {
        // Older results predate these fields.
        const o = r.spec as Partial<DesignSpec>;
        setSpec({
          ...r.spec,
          customEnvironments: o.customEnvironments ?? [],
          function: o.function ?? '',
          customProperties: o.customProperties ?? [],
          propertyLimits: o.propertyLimits ?? [],
          customObjective: o.customObjective ?? null,
        });
        setText(r.spec.sourceText);
        setAudience(r.spec.audience);
        setQuestions([]);
        setStep('confirm');
      })
      .catch((e: Error) => setError({ message: e.message, issues: [] }))
      .finally(() => setBusy(false));
  }, [editId]);

  const showError = (e: unknown) => {
    const err = e instanceof ApiError ? e : new ApiError((e as Error).message ?? 'Something went wrong.', 0);
    setError({ message: err.message, issues: err.issues });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (err.status === 401 || err.status === 403) openKeyDialog(); // the user's own key was rejected
  };

  const extract = useCallback(async () => {
    if (text.trim().length < 5 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.extract(text.trim(), audience);
      setSpec(r.spec);
      setQuestions(r.questions);
      setAnswered({});
      setStep('confirm');
      window.scrollTo({ top: 0 });
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  }, [text, audience, busy]);

  const run = async () => {
    if (!spec) return;
    const problems = specProblems(spec);
    if (problems.length) {
      setError({ message: 'Please fix these before continuing:', issues: problems.map((m) => ({ path: '', message: m })) });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setError(null);
    setStep('running');
    window.scrollTo({ top: 0 });
    try {
      const r = await api.createSelection(spec);
      router.push(`/results/${r.id}`);
    } catch (e) {
      setStep('confirm');
      showError(e);
    }
  };

  const patch = (p: Partial<DesignSpec>) => setSpec((s) => (s ? { ...s, ...p } : s));

  // "Anything else?" — re-read the brief from the description plus the new sentence (no forms).
  const [refining, setRefining] = useState(false);
  const refine = async (extra: string) => {
    if (!spec) return;
    const combined = `${(spec.sourceText || text).trim()}\n${extra}`.slice(0, 2000);
    setRefining(true);
    setError(null);
    try {
      const r = await api.extract(combined, spec.audience);
      setSpec({ ...r.spec, audience: spec.audience });
      setText(combined);
      setQuestions(r.questions);
      setAnswered({});
    } catch (e) {
      showError(e);
    } finally {
      setRefining(false);
    }
  };

  // ------------------------------------------------------------------ views
  if (step === 'running') return <Progress live={live} />;

  if (step === 'confirm' && spec) {
    const sized = SIZED.includes(spec.component);
    const willSize = sized && spec.load && spec.length;
    const open = questions.filter((_, i) => !answered[i]).length;
    return (
      <div className="mx-auto max-w-3xl pb-28">
        <button className="mb-2 text-sm font-medium text-slate-500 hover:text-slate-800" onClick={() => (editId ? router.push('/') : (setError(null), setStep('describe')))}>
          ← {editId ? 'Start over' : 'Back to description'}
        </button>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Here’s the brief</h1>
        <p className="mb-6 mt-1 text-slate-600">We turned your description into requirements. Remove anything that’s wrong, then find materials.</p>

        {error && (
          <div className="mb-4">
            <Banner tone="danger" title={error.message}>
              {error.issues.length > 0 && (
                <ul className="list-disc pl-4">
                  {error.issues.map((i, k) => (
                    <li key={k}>
                      {i.path && <code className="mr-1 text-xs">{i.path}</code>}
                      {i.message}
                    </li>
                  ))}
                </ul>
              )}
            </Banner>
          </div>
        )}

        {questions.length > 0 && (
          <section className="mb-4 space-y-3">
            {open > 0 && <p className="text-sm text-slate-500">Quick question{questions.length > 1 ? 's' : ''} — optional, a sensible default is used otherwise:</p>}
            {questions.map((q, i) => (
              <QuestionCard
                key={i}
                q={q}
                answered={answered[i]}
                onAnswer={(label, value) => {
                  setSpec((s) => (s ? applyAnswer(s, q.field, value) : s));
                  setAnswered((a) => ({ ...a, [i]: label }));
                }}
                onOther={
                  q.field === 'environment' || q.field === 'customEnvironments'
                    ? (text) => {
                        setSpec((s) => (s ? { ...s, customEnvironments: [...s.customEnvironments.filter((x) => x.toLowerCase() !== text.toLowerCase()), text].slice(0, 5) } : s));
                        setAnswered((a) => ({ ...a, [i]: text }));
                      }
                    : undefined
                }
              />
            ))}
          </section>
        )}

        <BriefEditor spec={spec} onChange={patch} onRefine={refine} refining={refining} />

        {spec.assumptions.length > 0 && (
          <details className="group mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer select-none items-center justify-between text-sm font-semibold text-slate-800">
              <span>💡 We assumed {spec.assumptions.length} thing{spec.assumptions.length > 1 ? 's' : ''}</span>
              <span aria-hidden className="text-slate-400 transition group-open:rotate-180">⌄</span>
            </summary>
            <ul className="mt-3 space-y-2">
              {spec.assumptions.map((a, i) => (
                <li key={i} className="flex items-start gap-2 rounded-lg bg-slate-50 p-2 text-sm text-slate-700">
                  <span className="flex-1">{a}</span>
                  <button
                    type="button"
                    aria-label={`Remove assumption: ${a}`}
                    title="Remove"
                    className="rounded px-1 text-slate-400 hover:bg-rose-100 hover:text-rose-700"
                    onClick={() => patch({ assumptions: spec.assumptions.filter((_, k) => k !== i) })}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}

        <details className="group mt-4 [&_summary::-webkit-details-marker]:hidden">
          <summary className="cursor-pointer select-none py-2 text-sm font-medium text-slate-500 hover:text-slate-800">
            <span className="group-open:hidden">⚙️ Fine-tune every detail (optional) ›</span>
            <span className="hidden group-open:inline">⚙️ Hide details ‹</span>
          </summary>
          <div className="mt-2">
            <SpecEditor spec={spec} onChange={patch} />
          </div>
        </details>

        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
            <p className="hidden text-sm text-slate-600 sm:block">
              {willSize ? 'We’ll size the part and give its mass and cost' : sized ? 'Add a load and length above to get part sizes' : 'We’ll rank materials from every family'}
            </p>
            <Button size="lg" onClick={run} disabled={refining} className="w-full sm:w-auto">
              Find materials →
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------ describe
  return (
    <div>
      <div className="mx-auto max-w-3xl">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">What do you want to build?</h1>
          <p className="mx-auto mt-3 max-w-xl text-slate-600">
            Describe it in your own words. We work out the requirements, check materials from every family, calculate the size you need and explain why.
          </p>
        </div>

        {error && (
          <div className="mt-6">
            <Banner tone="danger" title={error.message}>
              {error.issues.map((i, k) => (
                <p key={k}>{i.message}</p>
              ))}
            </Banner>
          </div>
        )}

        <Card className="mt-8">
          {busy && editId ? (
            <div className="flex items-center gap-3 py-8 text-slate-500">
              <Spinner /> Loading the saved requirements…
            </div>
          ) : (
            <>
              <label htmlFor="describe" className="sr-only">
                Describe your project
              </label>
              <textarea
                id="describe"
                ref={textRef}
                rows={5}
                maxLength={2000}
                value={text}
                disabled={busy}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) extract();
                }}
                placeholder="e.g. A shelf 1 m long for heavy books in my garage. I have a saw and a drill."
                className="block w-full resize-y rounded-xl border-0 p-4 text-base text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-brand-500 disabled:bg-slate-50"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="self-center text-xs font-medium text-slate-500">Try:</span>
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex.label}
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setText(ex.text);
                      textRef.current?.focus();
                    }}
                    className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700 transition hover:bg-brand-50 hover:text-brand-700"
                  >
                    <span aria-hidden>{ex.icon}</span> {ex.label}
                  </button>
                ))}
              </div>

              <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="mb-1.5 text-sm font-medium text-slate-700">Explain the result for</p>
                  <Segmented
                    value={audience}
                    onChange={setAudience}
                    disabled={busy}
                    options={AUDIENCES.map((a) => ({ value: a, label: `${AUDIENCE_LABEL[a].icon} ${AUDIENCE_LABEL[a].label}`, title: AUDIENCE_LABEL[a].hint }))}
                  />
                  <p className="mt-1 text-xs text-slate-500">{AUDIENCE_LABEL[audience].hint}</p>
                </div>
                <Button size="lg" onClick={extract} busy={busy} disabled={text.trim().length < 5} title="Ctrl/⌘ + Enter">
                  {busy ? 'Understanding…' : 'Continue →'}
                </Button>
              </div>
            </>
          )}
        </Card>
        <p className="mt-3 text-center text-xs text-slate-400">{text.length}/2000 · Ctrl/⌘ + Enter to continue</p>
      </div>
      <RecentList items={recent} />
    </div>
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center gap-3 py-24 text-slate-500">
          <Spinner /> Loading…
        </div>
      }
    >
      <Home />
    </Suspense>
  );
}
