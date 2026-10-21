'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/lib/api';
import { clearUserKey, getUserKey, isKeyRemembered, maskKey, setUserKey } from '@/lib/apiKey';
import { Banner, Button, cx, inputClass } from './ui';

/**
 * Lets the user run MatSelect with their own Claude API key when the server has none.
 * The server checks the key with a free call, then it is kept only in this browser.
 */
export function ApiKeyDialog({
  open,
  onClose,
  serverHasKey,
}: {
  open: boolean;
  onClose: () => void;
  serverHasKey: boolean;
}) {
  const [value, setValue] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checkResult, setCheckResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setSavedKey(getUserKey());
    setRemember(isKeyRemembered());
    setValue('');
    setCheckResult(null);
    // Wait for the dialog to be in the DOM before focusing the input.
    setTimeout(() => inputRef.current?.focus(), 50);
    const closeOnEscape = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open, onClose]);

  if (!open) return null;

  const save = async () => {
    const key = value.trim();
    if (!key) return;
    setBusy(true);
    setCheckResult(null);
    try {
      const verification = await api.verifyKey(key);
      setCheckResult({ ok: verification.valid, message: verification.message });
      if (verification.valid) {
        setUserKey(key, remember);
        setSavedKey(key);
        setValue('');
      }
    } catch (err) {
      setCheckResult({ ok: false, message: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  // Rendered into <body> because the sticky header uses backdrop-filter, which would otherwise
  // trap this fixed overlay inside the header.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="key-title"
        className="animate-fade-in w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="key-title" className="text-lg font-semibold text-slate-900">
              🔑 Use your own Claude API key
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              With a key, Claude reads your description and finds materials from across the world and the research literature. Without one, MatSelect uses its built-in demo data.
            </p>
          </div>
          <button aria-label="Close" onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            ✕
          </button>
        </div>

        {serverHasKey && (
          <div className="mt-4">
            <Banner tone="success" title="This server already has a key">
              <p>Claude is already on for everyone here, so you don’t need your own key.</p>
            </Banner>
          </div>
        )}

        {savedKey && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-emerald-200">
            <span>
              ✓ Using your key <code className="text-xs">{maskKey(savedKey)}</code>
              <span className="block text-xs text-emerald-700">{isKeyRemembered() ? 'Remembered on this device' : 'Forgotten when you close this tab'}</span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                clearUserKey();
                setSavedKey(null);
                setCheckResult(null);
              }}
            >
              Remove
            </Button>
          </div>
        )}

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">{savedKey ? 'Replace with a new key' : 'Your API key'}</span>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type={showKey ? 'text' : 'password'}
                autoComplete="off"
                spellCheck={false}
                className={cx(inputClass, 'font-mono')}
                placeholder="sk-ant-…"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && save()}
              />
              <Button variant="secondary" onClick={() => setShowKey((shown) => !shown)} title={showKey ? 'Hide key' : 'Show key'}>
                {showKey ? '🙈' : '👁️'}
              </Button>
            </div>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-brand-600"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            Remember on this device
          </label>

          {checkResult && (
            <Banner tone={checkResult.ok ? 'success' : 'danger'}>
              <p>{checkResult.ok ? `Saved. ${checkResult.message}` : checkResult.message}</p>
            </Banner>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" className="text-sm font-medium text-brand-700 hover:underline">
              Get a key at console.anthropic.com ↗
            </a>
            <Button onClick={save} busy={busy} disabled={value.trim().length < 20}>
              Check & save
            </Button>
          </div>
        </div>

        <ul className="mt-5 space-y-1 border-t border-slate-100 pt-4 text-xs text-slate-500">
          <li>🔒 Your key stays in this browser. It’s sent only to the MatSelect server with each request that needs Claude, and the server never saves or logs it.</li>
          <li>💳 Calls are billed to your Anthropic account — a full selection is about 7 Claude calls.</li>
          <li>
            📖 New here? Read the <Link href="/tutorial#api-key" className="underline" onClick={onClose}>tutorial</Link>.
          </li>
        </ul>
      </div>
    </div>,
    document.body,
  );
}
