'use client';

import { useEffect, useState } from 'react';
import { ResultsView } from '@/components/ResultsView';
import { Banner, ButtonLink, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import type { SelectionResult } from '@/lib/types';

export default function ResultsPage({ params }: { params: { id: string } }) {
  const [result, setResult] = useState<SelectionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Ignore a response that arrives after the page has moved on to another id.
    let isCurrent = true;
    api
      .getSelection(params.id)
      .then((selection) => isCurrent && setResult(selection))
      .catch((err: Error) => isCurrent && setError(err.message));
    return () => {
      isCurrent = false;
    };
  }, [params.id]);

  useEffect(() => {
    if (result) document.title = `${result.spec.title} — MatSelect`;
  }, [result]);

  if (error) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <Banner tone="danger" title="Couldn’t load this result">
          <p>{error}</p>
        </Banner>
        <ButtonLink href="/">Start a new selection</ButtonLink>
      </div>
    );
  }
  if (!result) {
    return (
      <div className="flex items-center justify-center gap-3 py-24 text-slate-500">
        <Spinner /> Loading result…
      </div>
    );
  }
  return <ResultsView result={result} />;
}
