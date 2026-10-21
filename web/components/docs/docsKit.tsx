import type { ReactNode } from 'react';

export function DocSection({ id, kicker, title, children }: { id: string; kicker?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      {kicker && <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">{kicker}</p>}
      <h2 className="mb-4 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{title}</h2>
      <div className="prose prose-slate max-w-none prose-h3:mb-2 prose-h3:mt-7 prose-h3:text-lg prose-p:my-3 prose-li:my-1">{children}</div>
    </section>
  );
}

export function Callout({ icon, title, children }: { icon: string; title?: string; children: ReactNode }) {
  return (
    <div className="not-prose my-4 flex gap-3 rounded-xl bg-brand-50/70 p-4 text-sm leading-relaxed text-slate-700 ring-1 ring-inset ring-brand-100">
      <span aria-hidden className="text-lg">
        {icon}
      </span>
      <div>
        {title && <p className="mb-1 font-semibold text-slate-900">{title}</p>}
        {children}
      </div>
    </div>
  );
}

/** A displayed equation, with an optional plain-words reading underneath. */
export function Formula({ children, says }: { children: ReactNode; says?: ReactNode }) {
  return (
    <div className="not-prose my-4 rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-inset ring-slate-200">
      <div className="overflow-x-auto text-center font-serif text-lg text-slate-900 sm:text-xl">{children}</div>
      {says && <p className="mt-2 text-center text-sm text-slate-600">{says}</p>}
    </div>
  );
}

/** A small "try it" panel that holds an interactive demo. */
export function Playground({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="not-prose my-6 rounded-2xl border-2 border-dashed border-brand-200 bg-white p-4 sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">▶ Try it yourself</p>
      <p className="font-semibold text-slate-900">{title}</p>
      {hint && <p className="mt-1 text-sm text-slate-600">{hint}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

/** A reference marker that links to the reference list at the bottom of the page. */
export function Cite({ n }: { n: number }) {
  return (
    <sup>
      <a href={`#ref-${n}`} className="no-underline">
        [{n}]
      </a>
    </sup>
  );
}

export function Term({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-slate-900">{children}</strong>;
}
