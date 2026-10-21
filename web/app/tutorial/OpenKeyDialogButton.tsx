'use client';

import { openKeyDialog } from '@/lib/apiKey';

export function OpenKeyDialogButton() {
  return (
    <button type="button" onClick={openKeyDialog} className="font-semibold text-brand-700 underline">
      open the key settings now
    </button>
  );
}
