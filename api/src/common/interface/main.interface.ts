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

export enum KeySource {
  Server = 'server',
  User = 'user',
  None = 'none',
}

// Which Claude key a request uses. Never stored or logged.
export interface LlmContextI {
  readonly apiKey: string | null;
  readonly keySource: KeySource;
}
