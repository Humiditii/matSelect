import Link from 'next/link';
import type { SelectionSummary } from '@/lib/types';

export function RecentSelections({ selections }: { selections: SelectionSummary[] }) {
  if (!selections.length) return null;
  return (
    <section className="mt-10">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Recent selections</h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {selections.slice(0, 9).map((selection) => (
          <li key={selection.id}>
            <Link
              href={`/results/${selection.id}`}
              className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-300 hover:shadow-md"
            >
              <p className="font-semibold text-slate-900">{selection.title}</p>
              <p className="mt-1 text-sm text-slate-600">{selection.topPick ? <>🥇 {selection.topPick}</> : 'No material fitted'}</p>
              <p className="mt-2 text-xs text-slate-400">
                {new Date(selection.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} ·{' '}
                {selection.candidates} candidates
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
