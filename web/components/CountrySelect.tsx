'use client';

import { useEffect, useState } from 'react';
import { countries } from '@/lib/labels';
import { cx, inputClass } from './ui';

/** Country picker from the browser's own country names (Intl), value = ISO two-letter code. */
export function CountrySelect({
  value,
  onChange,
  id,
  placeholder = 'Not set',
  className,
}: {
  value: string | null | undefined;
  onChange: (code: string | null) => void;
  id?: string;
  placeholder?: string;
  className?: string;
}) {
  // Built on the client only: Intl data can differ between server and browser.
  const [list, setList] = useState<{ code: string; name: string }[]>([]);
  useEffect(() => setList(countries()), []);
  return (
    <select id={id} aria-label="Country" className={cx(inputClass, className)} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{placeholder}</option>
      {value && !list.some((c) => c.code === value) && <option value={value}>{value}</option>}
      {list.map((c) => (
        <option key={c.code} value={c.code}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
