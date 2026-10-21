'use client';

import Link from 'next/link';
import { ReactNode, useEffect, useState } from 'react';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export function Card({ children, className, title, subtitle, action }: { children: ReactNode; className?: string; title?: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <section className={cx('animate-fade-in rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6', className)}>
      {(title || action) && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-base font-semibold text-slate-900 sm:text-lg">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', className?: string) {
  const styles = {
    primary: 'bg-brand-600 text-white shadow-sm hover:bg-brand-700 focus-visible:outline-brand-600 disabled:bg-brand-300',
    secondary: 'bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:text-slate-400',
    ghost: 'text-slate-600 hover:bg-slate-100 disabled:text-slate-300',
    danger: 'bg-rose-600 text-white hover:bg-rose-700',
  }[variant];
  const sizes = { sm: 'px-2.5 py-1.5 text-sm', md: 'px-4 py-2 text-sm', lg: 'px-5 py-3 text-base' }[size];
  return cx(
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed',
    styles,
    sizes,
    className,
  );
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  busy,
  type = 'button',
  className,
  size = 'md',
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: Variant;
  disabled?: boolean;
  busy?: boolean;
  type?: 'button' | 'submit';
  className?: string;
  size?: Size;
  title?: string;
}) {
  return (
    <button type={type} title={title} onClick={onClick} disabled={disabled || busy} className={buttonClass(variant, size, className)}>
      {busy && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

export function ButtonLink({ href, children, variant = 'primary', size = 'md', className }: { href: string; children: ReactNode; variant?: Variant; size?: Size; className?: string }) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  );
}

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={cx('animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

/** Toggleable pill used for multi-select options. */
export function Chip({
  active,
  onClick,
  children,
  title,
  tone = 'brand',
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  title?: string;
  tone?: 'brand' | 'rose';
}) {
  const on = tone === 'rose' ? 'bg-rose-50 text-rose-700 ring-rose-300' : 'bg-brand-50 text-brand-700 ring-brand-300';
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        'inline-flex select-none items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset transition',
        active ? on : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 hover:ring-slate-300',
      )}
    >
      {active && <span aria-hidden>✓</span>}
      {children}
    </button>
  );
}

/** Single-choice segmented control. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  disabled,
  size = 'md',
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
}) {
  return (
    <div role="radiogroup" className="inline-flex max-w-full flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={cx(
            'rounded-lg font-medium transition disabled:cursor-not-allowed',
            size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
            value === o.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Badge({ children, className, title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', className ?? 'bg-slate-50 text-slate-600 ring-slate-200')}>
      {children}
    </span>
  );
}

export function Banner({ tone, title, children, icon }: { tone: 'info' | 'warn' | 'danger' | 'success'; title?: ReactNode; children: ReactNode; icon?: string }) {
  const s = {
    info: 'border-sky-200 bg-sky-50 text-sky-900',
    warn: 'border-amber-200 bg-amber-50 text-amber-900',
    danger: 'border-rose-300 bg-rose-50 text-rose-900',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  }[tone];
  const i = icon ?? { info: 'ℹ️', warn: '⚠️', danger: '⛔', success: '✅' }[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cx('animate-fade-in flex gap-3 rounded-xl border p-3 text-sm sm:p-4', s)}>
      <span aria-hidden className="text-base leading-5">{i}</span>
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        <div className={cx(title ? 'mt-1' : '', 'space-y-1')}>{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export const inputClass =
  'block w-full rounded-xl border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-brand-500';

/**
 * Number input that keeps the user's typing (e.g. "1." or "") while editing and reports a number or null.
 */
export function NumberInput({
  value,
  onChange,
  placeholder,
  min,
  step = 'any',
  className,
  ariaLabel,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
  min?: number;
  step?: number | 'any';
  className?: string;
  ariaLabel?: string;
}) {
  const [text, setText] = useState(value === null ? '' : String(value));
  useEffect(() => {
    const parsed = text.trim() === '' ? null : Number(text);
    if (parsed !== value) setText(value === null ? '' : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      type="number"
      inputMode="decimal"
      aria-label={ariaLabel}
      className={cx(inputClass, className)}
      value={text}
      min={min}
      step={step}
      placeholder={placeholder}
      onChange={(e) => {
        setText(e.target.value);
        const v = e.target.value.trim() === '' ? null : Number(e.target.value);
        if (v === null || Number.isFinite(v)) onChange(v);
      }}
    />
  );
}

export function QuantityInput({
  value,
  onChange,
  units,
  defaultUnit,
  placeholder,
  ariaLabel,
}: {
  value: { value: number; unit: string } | null;
  onChange: (q: { value: number; unit: string } | null) => void;
  units: string[];
  defaultUnit: string;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [unit, setUnit] = useState(value?.unit ?? defaultUnit);
  useEffect(() => {
    if (value?.unit) setUnit(value.unit);
  }, [value?.unit]);
  const unitOptions = units.includes(unit) ? units : [unit, ...units];
  return (
    <div className="flex rounded-xl shadow-sm">
      <NumberInput
        ariaLabel={ariaLabel}
        className="rounded-r-none shadow-none"
        value={value?.value ?? null}
        placeholder={placeholder}
        min={0}
        onChange={(v) => onChange(v === null || v <= 0 ? null : { value: v, unit })}
      />
      <select
        aria-label={`${ariaLabel ?? 'quantity'} unit`}
        className="-ml-px rounded-r-xl border-0 bg-slate-50 py-2 pl-3 pr-8 text-sm text-slate-700 ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-brand-500"
        value={unit}
        onChange={(e) => {
          setUnit(e.target.value);
          if (value) onChange({ value: value.value, unit: e.target.value });
        }}
      >
        {unitOptions.map((u) => (
          <option key={u}>{u}</option>
        ))}
      </select>
    </div>
  );
}

export function Collapsible({ title, children, defaultOpen = false, count }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean; count?: number }) {
  return (
    <details open={defaultOpen} className="group rounded-2xl border border-slate-200 bg-white shadow-sm [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer select-none items-center justify-between gap-3 p-4 sm:p-6">
        <span className="flex items-center gap-2 text-base font-semibold text-slate-900 sm:text-lg">
          {title}
          {count !== undefined && <Badge>{count}</Badge>}
        </span>
        <span aria-hidden className="text-slate-400 transition group-open:rotate-180">⌄</span>
      </summary>
      <div className="border-t border-slate-100 p-4 sm:p-6">{children}</div>
    </details>
  );
}
