'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { KEY_EVENT, OPEN_KEY_DIALOG_EVENT, getUserKey } from '@/lib/apiKey';
import type { Health } from '@/lib/types';
import { ApiKeyDialog } from './ApiKeyDialog';
import { cx } from './ui';

type KeyMode = 'server' | 'user' | 'demo';

const MODE_LABEL: Record<KeyMode, string> = {
  server: '● Claude connected',
  user: '● Using your Claude key',
  demo: '● Demo data · Add API key',
};

const MODE_STYLE: Record<KeyMode, string> = {
  server: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  user: 'bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100',
  demo: 'bg-amber-50 text-amber-800 ring-amber-200 hover:bg-amber-100',
};

// Shows whether the app runs with the server's key, the user's own key or demo data.
// It also owns the key dialog, which any page can open with openKeyDialog().
export function StatusPill() {
  const [health, setHealth] = useState<Health | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [hasUserKey, setHasUserKey] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api
      .health()
      .then((status) => {
        setHealth(status);
        setIsOffline(false);
      })
      .catch(() => setIsOffline(true));
    const syncUserKey = () => setHasUserKey(!!getUserKey());
    const openDialog = () => setOpen(true);
    syncUserKey();
    window.addEventListener(KEY_EVENT, syncUserKey);
    window.addEventListener(OPEN_KEY_DIALOG_EVENT, openDialog);
    window.addEventListener('storage', syncUserKey);
    return () => {
      window.removeEventListener(KEY_EVENT, syncUserKey);
      window.removeEventListener(OPEN_KEY_DIALOG_EVENT, openDialog);
      window.removeEventListener('storage', syncUserKey);
    };
  }, []);

  const close = useCallback(() => setOpen(false), []);

  if (isOffline) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-200">
        ● API offline
      </span>
    );
  }
  if (!health) return null;

  let mode: KeyMode = 'demo';
  if (health.serverHasKey) mode = 'server';
  else if (hasUserKey) mode = 'user';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={mode === 'server' ? `Claude model: ${health.model} (server key)` : 'Manage your Claude API key'}
        className={cx(
          'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition',
          MODE_STYLE[mode],
        )}
      >
        {MODE_LABEL[mode]}
      </button>
      <ApiKeyDialog open={open} onClose={close} serverHasKey={health.serverHasKey} />
    </>
  );
}
