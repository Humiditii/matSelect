'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { BriefEditor } from '@/components/BriefEditor';
import { MAX_CUSTOM_ENVIRONMENTS } from '@/components/CustomEnvironmentInput';
import { AssumptionList } from '@/components/home/AssumptionList';
import { QuestionCard } from '@/components/home/QuestionCard';
import { RecentSelections } from '@/components/home/RecentSelections';
import { SelectionProgress } from '@/components/home/SelectionProgress';
import { SpecEditor } from '@/components/SpecEditor';
import { Banner, Button, Card, Segmented, Spinner } from '@/components/ui';
import { ApiError, api, isKeyRejected } from '@/lib/api';
import { openKeyDialog } from '@/lib/apiKey';
import { AUDIENCE_LABEL, AUDIENCE_OPTIONS, EXAMPLES } from '@/lib/labels';
import { applyAnswer, findSpecProblems, isSizedComponent, withSpecDefaults } from '@/lib/spec';
import type { Audience, DesignSpec, Question, SelectionSummary } from '@/lib/types';

type Step = 'describe' | 'confirm' | 'running';

interface PageError {
  message: string;
  issues: { path: string; message: string }[];
}

const MAX_DESCRIPTION_LENGTH = 2000;

function runButtonHint(spec: DesignSpec) {
  if (!isSizedComponent(spec.component)) return 'We’ll rank materials from every family';
  if (spec.load && spec.length) return 'We’ll size the part and give its mass and cost';
  return 'Add a load and length above to get part sizes';
}

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
  // The chosen option label for each answered question, by question index.
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [refining, setRefining] = useState(false);
  const [error, setError] = useState<PageError | null>(null);
  const [recent, setRecent] = useState<SelectionSummary[]>([]);
  const [live, setLive] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // "/?q=..." (from "Try it" in the tutorial) pre-fills the description.
  useEffect(() => {
    if (prefill && !editId) {
      setText(prefill.slice(0, MAX_DESCRIPTION_LENGTH));
      setStep('describe');
    }
  }, [prefill, editId]);

  useEffect(() => {
    api.listSelections().then(setRecent).catch(() => undefined);
    api
      .health()
      .then((health) => setLive(health.llmProvider === 'anthropic'))
      .catch(() => undefined);
  }, []);

  // "/?edit=<id>" opens that selection's spec for editing. Leaving edit mode (e.g. via the logo) resets the page.
  const loadedEditId = useRef<string | null>(null);
  useEffect(() => {
    if (!editId) {
      if (loadedEditId.current) {
        loadedEditId.current = null;
        setSpec(null);
        setText('');
        setError(null);
        setStep('describe');
      }
      return;
    }
    loadedEditId.current = editId;
    setBusy(true);
    api
      .getSelection(editId)
      .then((saved) => {
        setSpec(withSpecDefaults(saved.spec));
        setText(saved.spec.sourceText);
        setAudience(saved.spec.audience);
        setQuestions([]);
        setStep('confirm');
      })
      .catch((err: Error) => setError({ message: err.message, issues: [] }))
      .finally(() => setBusy(false));
  }, [editId]);

  const showError = (thrown: unknown) => {
    const err = thrown instanceof ApiError ? thrown : new ApiError((thrown as Error).message ?? 'Something went wrong.', 0);
    setError({ message: err.message, issues: err.issues });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (isKeyRejected(err)) openKeyDialog();
  };

  const readDescription = useCallback(async () => {
    if (text.trim().length < 5 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const extracted = await api.extract(text.trim(), audience);
      setSpec(extracted.spec);
      setQuestions(extracted.questions);
      setAnswers({});
      setStep('confirm');
      window.scrollTo({ top: 0 });
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  }, [text, audience, busy]);

  const runSelection = async () => {
    if (!spec) return;
    const problems = findSpecProblems(spec);
    if (problems.length) {
      setError({ message: 'Please fix these before continuing:', issues: problems.map((message) => ({ path: '', message })) });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setError(null);
    setStep('running');
    window.scrollTo({ top: 0 });
    try {
      const created = await api.createSelection(spec);
      router.push(`/results/${created.id}`);
    } catch (err) {
      setStep('confirm');
      showError(err);
    }
  };

  const updateSpec = (patch: Partial<DesignSpec>) => setSpec((current) => (current ? { ...current, ...patch } : current));

  // "Anything else?": read the brief again from the description plus the new sentence.
  const refine = async (extra: string) => {
    if (!spec) return;
    const combined = `${(spec.sourceText || text).trim()}\n${extra}`.slice(0, MAX_DESCRIPTION_LENGTH);
    setRefining(true);
    setError(null);
    try {
      const extracted = await api.extract(combined, spec.audience);
      setSpec({ ...extracted.spec, audience: spec.audience });
      setText(combined);
      setQuestions(extracted.questions);
      setAnswers({});
    } catch (err) {
      showError(err);
    } finally {
      setRefining(false);
    }
  };

  const answerQuestion = (index: number, field: string, label: string, value: unknown) => {
    setSpec((current) => (current ? applyAnswer(current, field, value) : current));
    setAnswers((current) => ({ ...current, [index]: label }));
  };

  // A typed answer to an environment question becomes a custom environment.
  const addTypedEnvironment = (index: number, environment: string) => {
    setSpec((current) => {
      if (!current) return current;
      const others = current.customEnvironments.filter((existing) => existing.toLowerCase() !== environment.toLowerCase());
      return { ...current, customEnvironments: [...others, environment].slice(0, MAX_CUSTOM_ENVIRONMENTS) };
    });
    setAnswers((current) => ({ ...current, [index]: environment }));
  };

  const goBack = () => {
    if (editId) {
      router.push('/');
      return;
    }
    setError(null);
    setStep('describe');
  };

  if (step === 'running') return <SelectionProgress live={live} />;

  if (step === 'confirm' && spec) {
    const unansweredCount = questions.filter((_, i) => !answers[i]).length;
    return (
      <div className="mx-auto max-w-3xl pb-28">
        <button className="mb-2 text-sm font-medium text-slate-500 hover:text-slate-800" onClick={goBack}>
          ← {editId ? 'Start over' : 'Back to description'}
        </button>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Here’s the brief</h1>
        <p className="mb-6 mt-1 text-slate-600">We turned your description into requirements. Remove anything that’s wrong, then find materials.</p>

        {error && (
          <div className="mb-4">
            <Banner tone="danger" title={error.message}>
              {error.issues.length > 0 && (
                <ul className="list-disc pl-4">
                  {error.issues.map((issue, i) => (
                    <li key={i}>
                      {issue.path && <code className="mr-1 text-xs">{issue.path}</code>}
                      {issue.message}
                    </li>
                  ))}
                </ul>
              )}
            </Banner>
          </div>
        )}

        {questions.length > 0 && (
          <section className="mb-4 space-y-3">
            {unansweredCount > 0 && (
              <p className="text-sm text-slate-500">
                Quick question{questions.length > 1 ? 's' : ''} — optional, a sensible default is used otherwise:
              </p>
            )}
            {questions.map((question, index) => {
              const isEnvironmentQuestion = question.field === 'environment' || question.field === 'customEnvironments';
              return (
                <QuestionCard
                  key={index}
                  question={question}
                  answer={answers[index]}
                  onAnswer={(label, value) => answerQuestion(index, question.field, label, value)}
                  onOtherAnswer={isEnvironmentQuestion ? (typed) => addTypedEnvironment(index, typed) : undefined}
                />
              );
            })}
          </section>
        )}

        <BriefEditor spec={spec} onChange={updateSpec} onRefine={refine} refining={refining} />

        <AssumptionList assumptions={spec.assumptions} onChange={(assumptions) => updateSpec({ assumptions })} />

        <details className="group mt-4 [&_summary::-webkit-details-marker]:hidden">
          <summary className="cursor-pointer select-none py-2 text-sm font-medium text-slate-500 hover:text-slate-800">
            <span className="group-open:hidden">⚙️ Fine-tune every detail (optional) ›</span>
            <span className="hidden group-open:inline">⚙️ Hide details ‹</span>
          </summary>
          <div className="mt-2">
            <SpecEditor spec={spec} onChange={updateSpec} />
          </div>
        </details>

        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
            <p className="hidden text-sm text-slate-600 sm:block">{runButtonHint(spec)}</p>
            <Button size="lg" onClick={runSelection} disabled={refining} className="w-full sm:w-auto">
              Find materials →
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mx-auto max-w-3xl">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">What do you want to build?</h1>
          <p className="mx-auto mt-3 max-w-xl text-slate-600">
            Describe it in your own words. We work out the requirements, check materials from every family, calculate the size you need and
            explain why.
          </p>
        </div>

        {error && (
          <div className="mt-6">
            <Banner tone="danger" title={error.message}>
              {error.issues.map((issue, i) => (
                <p key={i}>{issue.message}</p>
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
                maxLength={MAX_DESCRIPTION_LENGTH}
                value={text}
                disabled={busy}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) readDescription();
                }}
                placeholder="e.g. A shelf 1 m long for heavy books in my garage. I have a saw and a drill."
                className="block w-full resize-y rounded-xl border-0 p-4 text-base text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-brand-500 disabled:bg-slate-50"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="self-center text-xs font-medium text-slate-500">Try:</span>
                {EXAMPLES.map((example) => (
                  <button
                    key={example.label}
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setText(example.text);
                      textRef.current?.focus();
                    }}
                    className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700 transition hover:bg-brand-50 hover:text-brand-700"
                  >
                    <span aria-hidden>{example.icon}</span> {example.label}
                  </button>
                ))}
              </div>

              <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="mb-1.5 text-sm font-medium text-slate-700">Explain the result for</p>
                  <Segmented value={audience} onChange={setAudience} disabled={busy} options={AUDIENCE_OPTIONS} />
                  <p className="mt-1 text-xs text-slate-500">{AUDIENCE_LABEL[audience].hint}</p>
                </div>
                <Button size="lg" onClick={readDescription} busy={busy} disabled={text.trim().length < 5} title="Ctrl/⌘ + Enter">
                  {busy ? 'Understanding…' : 'Continue →'}
                </Button>
              </div>
            </>
          )}
        </Card>
        <p className="mt-3 text-center text-xs text-slate-400">
          {text.length}/{MAX_DESCRIPTION_LENGTH} · Ctrl/⌘ + Enter to continue
        </p>
      </div>
      <RecentSelections selections={recent} />
    </div>
  );
}

// useSearchParams needs a Suspense boundary in the App Router.
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
