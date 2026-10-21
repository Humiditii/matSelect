export const CONFIGS = {
  /** Header the web app uses to send a user's own Claude API key. */
  USER_KEY_HEADER: 'x-anthropic-api-key',
  /** Anthropic client instances kept for user-supplied keys (LRU). */
  USER_KEY_CLIENT_CACHE: 20,
  DEFAULT_LLM_MODEL: 'claude-opus-5-5',
  DEFAULT_LLM_EFFORT: 'medium',
  DEFAULT_LLM_TIMEOUT: 120 * 1000,
  DEFAULT_MATERIALS_PER_FAMILY: 10,
  DEFAULT_MC_SAMPLES: 1000,
  DEFAULT_RATE_LIMIT_PER_MIN: 30,
  RECENT_SELECTIONS_LIMIT: 20,
};

/** Models that accept the server-side refusal fallback (`fallbacks: "default"`). */
export const FALLBACK_MODELS =
  /^claude-(fable-5-1|opus-5-5|opus-5|sonnet-5-5)$/;
