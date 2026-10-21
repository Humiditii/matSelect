import { KEY_HEADER, getUserKey } from './apiKey';
import type { Audience, DesignSpec, ExtractResponse, Explanation, Health, SelectionResult, SelectionSummary, SourcingResult } from './types';

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly issues: { path: string; message: string }[] = [],
  ) {
    super(message);
  }
}

/**
 * Calls the API. Successful responses come wrapped as { message, status, statusCode, data } and are unwrapped;
 * errors come as { message, error, issues?, path, timestamp }.
 * `withKey` attaches the user's own Claude key (only used by the server when it has no key of its own).
 */
async function request<T>(path: string, init?: RequestInit & { withKey?: boolean }): Promise<T> {
  const userKey = init?.withKey ? getUserKey() : null;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(userKey ? { [KEY_HEADER]: userKey } : {}),
        ...(init?.headers ?? {}),
      },
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(`Cannot reach the MatSelect API at ${API_URL}. Is the backend running?`, 0);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const issues = Array.isArray(body?.issues) ? body.issues : [];
    const fallback =
      res.status === 502
        ? 'The AI service had a problem. Please try again in a moment.'
        : res.status === 429
          ? 'Too many requests — please wait a minute and try again.'
          : `The server answered with an error (${res.status}).`;
    const message = typeof body?.message === 'string' ? body.message : Array.isArray(body?.message) ? body.message.join('; ') : fallback;
    throw new ApiError(message, res.status, issues);
  }
  return (body && typeof body === 'object' && 'data' in body ? body.data : body) as T;
}

export const api = {
  health: () => request<Health>('/health'),
  extract: (text: string, audience: Audience) =>
    request<ExtractResponse>('/specs/extract', { method: 'POST', body: JSON.stringify({ text, audience }), withKey: true }),
  createSelection: (spec: DesignSpec) =>
    request<SelectionResult>('/selections', { method: 'POST', body: JSON.stringify({ spec }), withKey: true }),
  listSelections: () => request<SelectionSummary[]>('/selections'),
  getSelection: (id: string) => request<SelectionResult>(`/selections/${encodeURIComponent(id)}`),
  explain: (id: string, audience: Audience) =>
    request<Explanation>(`/selections/${encodeURIComponent(id)}/explain`, { method: 'POST', body: JSON.stringify({ audience }), withKey: true }),
  findSources: (id: string, country: string, city?: string, refresh = false) =>
    request<SourcingResult>(`/selections/${encodeURIComponent(id)}/sourcing`, {
      method: 'POST',
      body: JSON.stringify({ country, ...(city ? { city } : {}), ...(refresh ? { refresh: true } : {}) }),
      withKey: true,
    }),
  verifyKey: (apiKey: string) =>
    request<{ valid: boolean; model: string; message: string; serverHasKey: boolean }>('/api-key/verify', {
      method: 'POST',
      body: JSON.stringify({ apiKey }),
    }),
};
