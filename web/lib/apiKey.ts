// The user's own LLM API key lives only in this browser: in localStorage when they tick
// "Remember on this device", otherwise in sessionStorage so it is forgotten when the tab closes.
// It is sent in a header on requests that call the LLM and the server never stores it.
const STORAGE_KEY = 'matselect.anthropicKey';
export const KEY_HEADER = 'x-llm-api-key';
export const KEY_EVENT = 'matselect:key-changed';
export const OPEN_KEY_DIALOG_EVENT = 'matselect:open-key-dialog';

// Storage access throws when the browser blocks it.
function tryStorage<T>(action: () => T, fallback: T): T {
  try {
    return action();
  } catch {
    return fallback;
  }
}

export function getUserKey(): string | null {
  if (typeof window === 'undefined') return null;
  return tryStorage(() => sessionStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(STORAGE_KEY), null);
}

export function isKeyRemembered(): boolean {
  return tryStorage(() => !!localStorage.getItem(STORAGE_KEY), false);
}

export function setUserKey(key: string, remember: boolean) {
  tryStorage(() => {
    clearStorage();
    (remember ? localStorage : sessionStorage).setItem(STORAGE_KEY, key.trim());
  }, undefined);
  window.dispatchEvent(new Event(KEY_EVENT));
}

export function clearUserKey() {
  tryStorage(clearStorage, undefined);
  window.dispatchEvent(new Event(KEY_EVENT));
}

function clearStorage() {
  localStorage.removeItem(STORAGE_KEY);
  sessionStorage.removeItem(STORAGE_KEY);
}

export const openKeyDialog = () => window.dispatchEvent(new Event(OPEN_KEY_DIALOG_EVENT));

// Shows enough to recognise the key ("sk-ant-api03-…AbCd") without revealing it.
export const maskKey = (key: string) => `${key.slice(0, 12)}…${key.slice(-4)}`;
