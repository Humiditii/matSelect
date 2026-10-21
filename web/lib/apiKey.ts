/**
 * The user's own Claude API key, kept only in this browser.
 * "Remember on this device" → localStorage; otherwise sessionStorage (forgotten when the tab closes).
 * It is sent to the MatSelect API in a header on requests that call Claude, and is never stored by the server.
 */
const STORAGE_KEY = 'matselect.anthropicKey';
export const KEY_HEADER = 'x-anthropic-api-key';
export const KEY_EVENT = 'matselect:key-changed';
export const OPEN_KEY_DIALOG_EVENT = 'matselect:open-key-dialog';

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function getUserKey(): string | null {
  if (typeof window === 'undefined') return null;
  return safe(() => sessionStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(STORAGE_KEY), null);
}

export function isKeyRemembered(): boolean {
  return safe(() => !!localStorage.getItem(STORAGE_KEY), false);
}

export function setUserKey(key: string, remember: boolean) {
  safe(() => {
    clearStorage();
    (remember ? localStorage : sessionStorage).setItem(STORAGE_KEY, key.trim());
  }, undefined);
  window.dispatchEvent(new Event(KEY_EVENT));
}

export function clearUserKey() {
  safe(clearStorage, undefined);
  window.dispatchEvent(new Event(KEY_EVENT));
}

function clearStorage() {
  localStorage.removeItem(STORAGE_KEY);
  sessionStorage.removeItem(STORAGE_KEY);
}

export const openKeyDialog = () => window.dispatchEvent(new Event(OPEN_KEY_DIALOG_EVENT));

/** "sk-ant-api03-…AbCd" — enough to recognise it, never the whole key. */
export const maskKey = (k: string) => `${k.slice(0, 12)}…${k.slice(-4)}`;
