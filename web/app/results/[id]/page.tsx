'use client';

import { useEffect, useState } from 'react';
import { ResultsView } from '@/components/ResultsView';
import { Banner, ButtonLink, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import type { SelectionResult } from '@/lib/types';

export default function ResultsPage({ params }: { params: { id: string } }) {
  const [res, setRes] = useState<SelectionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .getSelection(params.id)
      .then((r) => alive && setRes(r))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [params.id]);

  useEffect(() => {
    if (res) document.title = `${res.spec.title} — MatSelect`;
  }, [res]);

  if (error)
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <Banner tone="danger" title="Couldn’t load this result">
          <p>{error}</p>
        </Banner>
        <ButtonLink href="/">Start a new selection</ButtonLink>
      </div>
    );
  if (!res)
    return (
      <div className="flex items-center justify-center gap-3 py-24 text-slate-500">
        <Spinner /> Loading result…
      </div>
    );
  return <ResultsView res={res} />;
}
