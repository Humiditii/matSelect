'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { KEY_EVENT, OPEN_KEY_DIALOG_EVENT, getUserKey } from '@/lib/apiKey';
import type { Health } from '@/lib/types';
import { ApiKeyDialog } from './ApiKeyDialog';
import { cx } from './ui';

/**
 * Shows which mode the app is in — server key, the user's own key, or demo data — and opens the key dialog.
 * Any page can open the dialog with `openKeyDialog()`.
 */
export function StatusPill() {
  const [health, setHealth] = useState<Health | null>(null);
  const [down, setDown] = useState(false);
  const [hasUserKey, setHasUserKey] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api
      .health()
      .then((h) => {
        setHealth(h);
        setDown(false);
      })
      .catch(() => setDown(true));
    const sync = () => setHasUserKey(!!getUserKey());
    const openDialog = () => setOpen(true);
    sync();
    window.addEventListener(KEY_EVENT, sync);
    window.addEventListener(OPEN_KEY_DIALOG_EVENT, openDialog);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(KEY_EVENT, sync);
      window.removeEventListener(OPEN_KEY_DIALOG_EVENT, openDialog);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const close = useCallback(() => setOpen(false), []);

  if (down)
    return <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-200">● API offline</span>;
  if (!health) return null;

  const mode = health.serverHasKey ? 'server' : hasUserKey ? 'user' : 'demo';
  const label = { server: '● Claude connected', user: '● Using your Claude key', demo: '● Demo data · Add API key' }[mode];
  const style = {
    server: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    user: 'bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100',
    demo: 'bg-amber-50 text-amber-800 ring-amber-200 hover:bg-amber-100',
  }[mode];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={mode === 'server' ? `Claude model: ${health.model} (server key)` : 'Manage your Claude API key'}
        className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition', style)}
      >
        {label}
      </button>
      <ApiKeyDialog open={open} onClose={close} serverHasKey={health.serverHasKey} />
    </>
  );
}
