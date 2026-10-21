'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { openKeyDialog } from '@/lib/apiKey';
import { browserCountry } from '@/lib/labels';
import type { SelectionResult, SourcingResult } from '@/lib/types';
import { CountrySelect } from './CountrySelect';
import { Badge, Banner, Button, Card, Spinner, inputClass } from './ui';

const LAST_COUNTRY = 'matselect.country';

const AVAILABILITY_STYLE: Record<string, string> = {
  'widely available': 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  'specialist suppliers': 'bg-sky-50 text-sky-700 ring-sky-200',
  'likely imported': 'bg-amber-50 text-amber-800 ring-amber-200',
};

/** Where to buy the top picks in a chosen country: live web search with a Claude key, guidance and search links without. */
export function WhereToBuy({ res }: { res: SelectionResult }) {
  const [country, setCountry] = useState<string | null>(null);
  const [city, setCity] = useState('');
  const [result, setResult] = useState<SourcingResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default: the brief's country, then the last one used here, then the browser's locale.
  useEffect(() => {
    let last: string | null = null;
    try {
      last = localStorage.getItem(LAST_COUNTRY);
    } catch {
      /* storage blocked */
    }
    const c = res.spec.country || last || browserCountry();
    setCountry(c);
    if (c && res.sourcing?.[c]) {
      setResult(res.sourcing[c]!);
      setCity(res.sourcing[c]!.city ?? '');
    }
  }, [res]);

  const find = async () => {
    if (!country) {
      setError('Choose a country first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      localStorage.setItem(LAST_COUNTRY, country);
    } catch {
      /* storage blocked */
    }
    try {
      // "Search again" on a result for the same place asks the server for a fresh search.
      const again = !!result && result.country === country && (result.city ?? '') === city.trim();
      setResult(await api.findSources(res.id, country, city.trim() || undefined, again));
    } catch (e) {
      const err = e as Error & { status?: number };
      setError(err.message);
      if (err.status === 401 || err.status === 403) openKeyDialog();
    } finally {
      setBusy(false);
    }
  };

  if (!res.ranking.length) return null;

  return (
    <Card title="Where to buy" subtitle="Suppliers and availability for the top picks in your country.">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="block sm:w-64">
          <span className="mb-1 block text-sm font-medium text-slate-700">Country</span>
          <CountrySelect id="sourcing-country" value={country} onChange={(c) => { setCountry(c); setResult(c ? res.sourcing?.[c] ?? null : null); setError(null); }} placeholder="Choose a country" />
        </label>
        {/* <label className="block sm:w-48">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            City <span className="font-normal text-slate-500">(optional)</span>
          </span>
          <input className={inputClass} value={city} maxLength={60} placeholder="Lagos" onChange={(e) => setCity(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && find()} />
        </label> */}
        <Button onClick={find} busy={busy} disabled={!country}>
          {result ? 'Search again' : 'Find suppliers'}
        </Button>
      </div>
      {/* <p className="mt-2 text-xs text-slate-500">Only the country and city are sent; with Claude, a live web search looks for suppliers there (this can take about a minute).</p> */}

      {busy && (
        <div className="mt-4 flex items-center gap-3 text-sm text-slate-500">
          <Spinner /> Searching for suppliers…
        </div>
      )}
      {error && (
        <div className="mt-4">
          <Banner tone="danger" title="Couldn’t find suppliers">
            <p>{error}</p>
          </Banner>
        </div>
      )}

      {result && !busy && (
        <div className="mt-5 space-y-4">
          <p className="text-sm text-slate-600">
            <strong className="text-slate-900">{result.city ? `${result.city}, ${result.countryName}` : result.countryName}</strong> · {result.note}
          </p>
          {result.items.map((it) => (
            <div key={it.materialId} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-slate-900">{it.name}</h3>
                {it.availability && <Badge className={AVAILABILITY_STYLE[it.availability]}>{it.availability}</Badge>}
              </div>
              {it.forms.length > 0 && <p className="mt-1 text-xs text-slate-500">Forms: {it.forms.join(', ')}</p>}
              {it.notes && <p className="mt-2 text-sm text-slate-700">{it.notes}</p>}
              {it.suppliers.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {it.suppliers.map((s) => (
                    <li key={s.url} className="text-sm">
                      <a href={s.url} target="_blank" rel="noreferrer noopener" className="font-medium text-brand-700 hover:underline">
                        {s.name} ↗
                      </a>
                      {s.note && <span className="text-slate-500"> — {s.note}</span>}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {it.searchLinks.map((l) => (
                  <a key={l.url} href={l.url} target="_blank" rel="noreferrer noopener" className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200">
                    🔎 {l.label}
                  </a>
                ))}
              </div>
            </div>
          ))}
          {result.dataSource === 'mock' && (
            <button className="text-sm font-semibold text-brand-700 underline" onClick={openKeyDialog}>
              Add a Claude API key for named suppliers →
            </button>
          )}
        </div>
      )}
    </Card>
  );
}
