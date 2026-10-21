'use client';

import { useState } from 'react';
import { Button, inputClass } from './ui';

export const MAX_CUSTOM_ENVIRONMENTS = 5;

/**
 * Adds a condition that isn't in the list, in the user's own words.
 * The compact version (used under a question) shows only the input, not the list of added conditions.
 */
export function CustomEnvironmentInput({
  values,
  onChange,
  compact,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  compact?: boolean;
}) {
  const [text, setText] = useState('');
  const trimmed = text.trim();
  const isFull = values.length >= MAX_CUSTOM_ENVIRONMENTS;
  const canAdd = trimmed.length >= 2 && !isFull;

  const add = () => {
    if (!canAdd) return;
    const alreadyAdded = values.some((value) => value.toLowerCase() === trimmed.toLowerCase());
    if (!alreadyAdded) onChange([...values, trimmed.slice(0, 80)]);
    setText('');
  };

  let placeholder = 'Something else? e.g. next to a swimming pool';
  if (isFull) placeholder = `Up to ${MAX_CUSTOM_ENVIRONMENTS} of your own`;
  else if (compact) placeholder = 'Other — type your own…';

  return (
    <div className={compact ? 'mt-3' : 'mt-3 space-y-2'}>
      {!compact && values.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {values.map((value) => (
            <span
              key={value}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 py-1.5 pl-3 pr-1.5 text-sm font-medium text-brand-700 ring-1 ring-inset ring-brand-300"
            >
              ✓ {value}
              <button
                type="button"
                aria-label={`Remove ${value}`}
                className="grid h-5 w-5 place-items-center rounded-full text-brand-500 hover:bg-brand-100 hover:text-brand-800"
                onClick={() => onChange(values.filter((other) => other !== value))}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex max-w-lg gap-2">
        <input
          className={inputClass}
          value={text}
          maxLength={80}
          disabled={isFull}
          aria-label="Add your own environment"
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button variant="secondary" onClick={add} disabled={!canAdd}>
          Add
        </Button>
      </div>
    </div>
  );
}
