'use client';

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api, isKeyRejected } from '@/lib/api';
import { openKeyDialog } from '@/lib/apiKey';
import { AUDIENCE_LABEL, AUDIENCE_OPTIONS } from '@/lib/labels';
import type { Audience, Explanation, SelectionResult } from '@/lib/types';
import { Badge, Banner, Card, Segmented, Spinner } from '../ui';

const PROSE_CLASS =
  'prose prose-slate max-w-none prose-headings:mb-2 prose-headings:mt-5 prose-h2:text-lg prose-p:my-2 ' +
  'prose-blockquote:border-rose-300 prose-blockquote:bg-rose-50 prose-blockquote:py-1 prose-blockquote:not-italic prose-li:my-0.5';

/** The written explanation, fetched once per audience the first time it is shown. */
export function ExplanationPanel({ result }: { result: SelectionResult }) {
  const [audience, setAudience] = useState<Audience>(result.spec.audience);
  const [explanations, setExplanations] = useState<Partial<Record<Audience, Explanation>>>(result.explanations ?? {});
  const [loading, setLoading] = useState<Audience | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requested = useRef(new Set<Audience>());

  useEffect(() => {
    if (explanations[audience] || requested.current.has(audience)) return;
    requested.current.add(audience);
    setLoading(audience);
    setError(null);
    api
      .explain(result.id, audience)
      .then((explanation) => setExplanations((current) => ({ ...current, [audience]: explanation })))
      .catch((err: Error & { status?: number }) => {
        requested.current.delete(audience);
        setError(err.message);
        if (isKeyRejected(err)) openKeyDialog();
      })
      .finally(() => setLoading((current) => (current === audience ? null : current)));
  }, [audience, explanations, result.id]);

  // A new object re-runs the effect above, which fetches again now the audience is no longer marked as requested.
  const retry = () => {
    setError(null);
    setExplanations((current) => ({ ...current }));
  };

  const explanation = explanations[audience];
  return (
    <Card
      title="Explanation"
      subtitle="Written for you from the calculation above."
      action={<Segmented size="sm" value={audience} disabled={loading !== null} onChange={setAudience} options={AUDIENCE_OPTIONS} />}
    >
      {loading === audience && !explanation && (
        <div className="flex items-center gap-3 py-8 text-sm text-slate-500">
          <Spinner /> Writing the {AUDIENCE_LABEL[audience].label.toLowerCase()} explanation…
        </div>
      )}
      {error && !explanation && (
        <Banner tone="danger" title="Couldn’t write this explanation">
          <p>{error}</p>
          <button className="font-semibold underline" onClick={retry}>
            Try again
          </button>
        </Banner>
      )}
      {explanation && (
        <div className="animate-fade-in">
          {explanation.grounded ? (
            <Badge className="mb-4 bg-emerald-50 text-emerald-700 ring-emerald-200">✓ Every number checked against the calculation</Badge>
          ) : (
            <div className="mb-4">
              <Banner tone="warn" title="Some numbers could not be verified">
                <p>
                  These numbers in the text don’t match the calculation: <strong>{explanation.unverifiedNumbers.join(', ')}</strong>. Trust
                  the cards and tables above.
                </p>
              </Banner>
            </div>
          )}
          <div className={PROSE_CLASS}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{explanation.text}</ReactMarkdown>
          </div>
        </div>
      )}
    </Card>
  );
}
