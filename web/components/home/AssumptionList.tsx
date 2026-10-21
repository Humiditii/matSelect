export function AssumptionList({ assumptions, onChange }: { assumptions: string[]; onChange: (assumptions: string[]) => void }) {
  if (!assumptions.length) return null;
  return (
    <details className="group mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer select-none items-center justify-between text-sm font-semibold text-slate-800">
        <span>
          💡 We assumed {assumptions.length} thing{assumptions.length > 1 ? 's' : ''}
        </span>
        <span aria-hidden className="text-slate-400 transition group-open:rotate-180">
          ⌄
        </span>
      </summary>
      <ul className="mt-3 space-y-2">
        {assumptions.map((assumption, index) => (
          <li key={index} className="flex items-start gap-2 rounded-lg bg-slate-50 p-2 text-sm text-slate-700">
            <span className="flex-1">{assumption}</span>
            <button
              type="button"
              aria-label={`Remove assumption: ${assumption}`}
              title="Remove"
              className="rounded px-1 text-slate-400 hover:bg-rose-100 hover:text-rose-700"
              onClick={() => onChange(assumptions.filter((_, k) => k !== index))}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
