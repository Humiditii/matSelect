'use client';

import { useEffect, useState } from 'react';
import { Country, countries } from '@/lib/labels';
import { cx, inputClass } from './ui';

// The value is a two-letter ISO country code.
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
  // Built on the client only, because Intl data can differ between the server and the browser.
  const [list, setList] = useState<Country[]>([]);
  useEffect(() => setList(countries()), []);
  return (
    <select
      id={id}
      aria-label="Country"
      className={cx(inputClass, className)}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">{placeholder}</option>
      {value && !list.some((country) => country.code === value) && <option value={value}>{value}</option>}
      {list.map((country) => (
        <option key={country.code} value={country.code}>
          {country.name}
        </option>
      ))}
    </select>
  );
}
