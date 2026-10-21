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

const STATUS_MESSAGES: Record<number, string> = {
  502: 'The AI service had a problem. Please try again in a moment.',
  429: 'Too many requests — please wait a minute and try again.',
};

function errorMessage(body: { message?: unknown } | null, status: number): string {
  if (typeof body?.message === 'string') return body.message;
  if (Array.isArray(body?.message)) return body.message.join('; ');
  return STATUS_MESSAGES[status] ?? `The server answered with an error (${status}).`;
}

// Successful responses are wrapped as { message, status, statusCode, data }, so we return `data`.
// `withKey` sends the user's own LLM key, which the server only uses when it has none of its own.
async function request<T>(path: string, init?: RequestInit & { withKey?: boolean }): Promise<T> {
  const userKey = init?.withKey ? getUserKey() : null;
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
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
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const issues = Array.isArray(body?.issues) ? body.issues : [];
    throw new ApiError(errorMessage(body, response.status), response.status, issues);
  }
  return (body && typeof body === 'object' && 'data' in body ? body.data : body) as T;
}

// True when the server rejected the user's own LLM key.
export const isKeyRejected = (error: { status?: number }) => error.status === 401 || error.status === 403;

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
    request<{ valid: boolean; message: string; serverHasKey: boolean }>('/api-key/verify', {
      method: 'POST',
      body: JSON.stringify({ apiKey }),
    }),
};
