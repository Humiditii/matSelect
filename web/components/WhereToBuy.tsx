'use client';

import { useEffect, useState } from 'react';
import { api, isKeyRejected } from '@/lib/api';
import { openKeyDialog } from '@/lib/apiKey';
import { browserCountry } from '@/lib/labels';
import type { SelectionResult, SourcingResult } from '@/lib/types';
import { CountrySelect } from './CountrySelect';
import { Badge, Banner, Button, Card, Spinner } from './ui';

const LAST_COUNTRY_KEY = 'matselect.country';

const AVAILABILITY_STYLE: Record<string, string> = {
  'widely available': 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  'specialist suppliers': 'bg-sky-50 text-sky-700 ring-sky-200',
  'likely imported': 'bg-amber-50 text-amber-800 ring-amber-200',
};

// localStorage throws when the browser blocks storage; the country is only a convenience.
function readLastCountry(): string | null {
  try {
    return localStorage.getItem(LAST_COUNTRY_KEY);
  } catch {
    return null;
  }
}

function saveLastCountry(country: string) {
  try {
    localStorage.setItem(LAST_COUNTRY_KEY, country);
  } catch {
    // Ignore.
  }
}

/**
 * Where to buy the top picks in a chosen country. With a Claude key the server runs a live web search;
 * without one it returns general guidance and search links.
 */
export function WhereToBuy({ result }: { result: SelectionResult }) {
  const [country, setCountry] = useState<string | null>(null);
  // There is no city input at the moment, but a saved search may still have one.
  const [city, setCity] = useState('');
  const [sourcing, setSourcing] = useState<SourcingResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Start with the brief's country, then the last one used here, then the browser's locale.
  useEffect(() => {
    const initial = result.spec.country || readLastCountry() || browserCountry();
    setCountry(initial);
    const saved = initial ? result.sourcing?.[initial] : undefined;
    if (saved) {
      setSourcing(saved);
      setCity(saved.city ?? '');
    }
  }, [result]);

  const changeCountry = (code: string | null) => {
    setCountry(code);
    setSourcing(code ? (result.sourcing?.[code] ?? null) : null);
    setError(null);
  };

  const findSuppliers = async () => {
    if (!country) {
      setError('Choose a country first.');
      return;
    }
    setBusy(true);
    setError(null);
    saveLastCountry(country);
    try {
      // Searching again for the same place asks the server for a fresh search instead of its saved one.
      const searchAgain = !!sourcing && sourcing.country === country && (sourcing.city ?? '') === city.trim();
      setSourcing(await api.findSources(result.id, country, city.trim() || undefined, searchAgain));
    } catch (e) {
      const err = e as Error & { status?: number };
      setError(err.message);
      if (isKeyRejected(err)) openKeyDialog();
    } finally {
      setBusy(false);
    }
  };

  if (!result.ranking.length) return null;

  return (
    <Card title="Where to buy" subtitle="Suppliers and availability for the top picks in your country.">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="block sm:w-64">
          <span className="mb-1 block text-sm font-medium text-slate-700">Country</span>
          <CountrySelect id="sourcing-country" value={country} onChange={changeCountry} placeholder="Choose a country" />
        </label>
        <Button onClick={findSuppliers} busy={busy} disabled={!country}>
          {sourcing ? 'Search again' : 'Find suppliers'}
        </Button>
      </div>

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

      {sourcing && !busy && (
        <div className="mt-5 space-y-4">
          <p className="text-sm text-slate-600">
            <strong className="text-slate-900">{sourcing.city ? `${sourcing.city}, ${sourcing.countryName}` : sourcing.countryName}</strong> ·{' '}
            {sourcing.note}
          </p>
          {sourcing.items.map((item) => (
            <div key={item.materialId} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-slate-900">{item.name}</h3>
                {item.availability && <Badge className={AVAILABILITY_STYLE[item.availability]}>{item.availability}</Badge>}
              </div>
              {item.forms.length > 0 && <p className="mt-1 text-xs text-slate-500">Forms: {item.forms.join(', ')}</p>}
              {item.notes && <p className="mt-2 text-sm text-slate-700">{item.notes}</p>}
              {item.suppliers.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {item.suppliers.map((supplier) => (
                    <li key={supplier.url} className="text-sm">
                      <a href={supplier.url} target="_blank" rel="noreferrer noopener" className="font-medium text-brand-700 hover:underline">
                        {supplier.name} ↗
                      </a>
                      {supplier.note && <span className="text-slate-500"> — {supplier.note}</span>}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {item.searchLinks.map((link) => (
                  <a
                    key={link.url}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
                  >
                    🔎 {link.label}
                  </a>
                ))}
              </div>
            </div>
          ))}
          {sourcing.dataSource === 'mock' && (
            <button className="text-sm font-semibold text-brand-700 underline" onClick={openKeyDialog}>
              Add a Claude API key for named suppliers →
            </button>
          )}
        </div>
      )}
    </Card>
  );
}
