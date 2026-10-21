export interface AppErr {
  readonly message: string;
  readonly status: number;
  readonly data?: object;
  readonly location?: string;
}

export interface ValidationIssueI {
  readonly path: string;
  readonly message: string;
}

/** Where the Claude API key for a request came from. */
export enum KeySource {
  Server = 'server',
  User = 'user',
  None = 'none',
}

/** Per-request LLM context: which key to use (never stored, never logged). */
export interface LlmContextI {
  readonly apiKey: string | null;
  readonly keySource: KeySource;
}
