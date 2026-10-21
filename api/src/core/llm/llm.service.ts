/**
 * Wrapper around Claude for structured (JSON Schema constrained) calls, plain-text calls and web search.
 *
 * The key is chosen per request (see `resolve`): the server's ANTHROPIC_API_KEY if configured, otherwise
 * a key the user sent from the web app (header `x-llm-api-key`), otherwise none, and callers then
 * use the built-in demo data. User keys only live in memory (the request and a small LRU of clients);
 * they are never stored or logged.
 *
 * Structured outputs (`output_config.format`) are used rather than a forced tool call, because current
 * models reject a forced tool_choice. Replies are still validated with zod, with one corrective retry.
 */
import Anthropic from '@anthropic-ai/sdk';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { AppException } from 'src/common/appResponse.parser';
import {
  CONFIGS,
  FALLBACK_MODELS,
} from 'src/common/constants/configs.constant';
import { KeySource, LlmContextI } from 'src/common/interface/main.interface';
import { AppLoggerService } from 'src/common/logging/logging.service';
import { StructuredCallI } from './interface/llm.interface';

type StreamParams = Parameters<Anthropic['beta']['messages']['stream']>[0];
type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

// Claude keys start with "sk-ant-". Anything else is rejected before a network call.
export const looksLikeKey = (k: unknown): k is string =>
  typeof k === 'string' && /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(k.trim());

@Injectable()
export class LlmService {
  private readonly serverKey: string | null;
  private readonly forceMock: boolean;
  readonly model: string;
  private readonly effort: Effort;
  private readonly timeout: number;
  private readonly clients = new Map<string, Anthropic>();
  private useFallbacks: boolean;
  private useFormat = true;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: AppLoggerService,
  ) {
    const key = this.configService.get<string>('ANTHROPIC_API_KEY')?.trim();
    this.serverKey = key || null;
    // LLM_PROVIDER=mock forces demo data even when keys are available (useful for demos and tests).
    this.forceMock = this.configService.get<string>('LLM_PROVIDER') === 'mock';
    this.model =
      this.configService.get<string>('LLM_MODEL') || CONFIGS.DEFAULT_LLM_MODEL;
    this.effort =
      (this.configService.get<string>('LLM_EFFORT') as Effort) ||
      (CONFIGS.DEFAULT_LLM_EFFORT as Effort);
    this.timeout =
      Number(this.configService.get('LLM_TIMEOUT_MS')) ||
      CONFIGS.DEFAULT_LLM_TIMEOUT;
    const fallbacks = this.configService.get<string>('LLM_FALLBACKS');
    this.useFallbacks = fallbacks
      ? ['true', '1', 'on', 'yes'].includes(fallbacks)
      : FALLBACK_MODELS.test(this.model);
  }

  // When the server has its own key, users never need theirs.
  get hasServerKey(): boolean {
    return !!this.serverKey && !this.forceMock;
  }

  resolve(userKey?: string | null): LlmContextI {
    if (this.forceMock) return { apiKey: null, keySource: KeySource.None };
    if (this.serverKey)
      return { apiKey: this.serverKey, keySource: KeySource.Server };
    if (looksLikeKey(userKey))
      return { apiKey: userKey.trim(), keySource: KeySource.User };
    return { apiKey: null, keySource: KeySource.None };
  }

  isLive(ctx: LlmContextI): boolean {
    return !!ctx.apiKey;
  }

  async verifyKey(
    apiKey: string,
  ): Promise<{ valid: boolean; model: string; message: string }> {
    if (!looksLikeKey(apiKey)) {
      return {
        valid: false,
        model: this.model,
        message: 'That does not look like a valid API key.',
      };
    }
    try {
      await this.client(apiKey.trim()).models.retrieve(this.model);
      return {
        valid: true,
        model: this.model,
        message: 'Key works.',
      };
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError)
        return {
          valid: false,
          model: this.model,
          message: 'This key was rejected. Check it was copied completely.',
        };
      if (
        err instanceof Anthropic.PermissionDeniedError ||
        err instanceof Anthropic.NotFoundError
      )
        return {
          valid: false,
          model: this.model,
          message: 'This key cannot use the model this app needs.',
        };
      if (err instanceof Anthropic.APIConnectionError)
        throw new AppException(
          'Could not reach the LLM service to check the key. Check the network connection.',
          502,
        );
      throw new AppException(
        `Could not check the key: ${(err as Error).message}`,
        502,
      );
    }
  }

  // JSON output constrained by `schema` and validated by `parse`. Retried once, telling Claude what was wrong.
  async structured<T>(ctx: LlmContextI, call: StructuredCallI<T>): Promise<T> {
    let errors: string | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await this.complete(
        ctx,
        call.label,
        call.system,
        call.user(errors),
        call.maxTokens ?? 32000,
        call.schema,
      );
      let json: unknown;
      try {
        json = JSON.parse(extractJson(raw));
      } catch {
        errors = 'The response was not valid JSON.';
        continue;
      }
      const parsed = call.parse.safeParse(json);
      if (parsed.success) return parsed.data;
      errors = parsed.error.issues
        .slice(0, 20)
        .map((i) => `- ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      this.logger.warn(
        `LlmService: ${call.label} output failed validation (attempt ${attempt + 1})\n${errors}`,
      );
    }
    throw new AppException(
      `The LLM's answer for ${call.label} did not match the expected format, even after a retry.`,
      502,
    );
  }

  async text(
    ctx: LlmContextI,
    label: string,
    system: string,
    user: string,
    maxTokens = 16000,
  ): Promise<string> {
    return (
      await this.complete(ctx, label, system, user, maxTokens, null)
    ).trim();
  }

  private client(apiKey: string): Anthropic {
    const id = createHash('sha256').update(apiKey).digest('hex');
    let client = this.clients.get(id);
    if (client) {
      // Re-inserting moves it to the end, which keeps the Map in least-recently-used order.
      this.clients.delete(id);
    } else {
      client = new Anthropic({ apiKey, timeout: this.timeout, maxRetries: 2 });
    }
    this.clients.set(id, client);
    while (this.clients.size > CONFIGS.USER_KEY_CLIENT_CACHE)
      this.clients.delete(this.clients.keys().next().value!);
    return client;
  }

  private requireKey(ctx: LlmContextI): string {
    if (!ctx.apiKey)
      throw new AppException(
        'No LLM API key is available for this request.',
        400,
      );
    return ctx.apiKey;
  }

  private fallbackParams() {
    return this.useFallbacks
      ? {
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default' as const,
        }
      : {};
  }

  private logUsage(
    label: string,
    ctx: LlmContextI,
    msg: Anthropic.Beta.Messages.BetaMessage,
    started: number,
  ) {
    this.logger.log(
      `LlmService: ${label} [${ctx.keySource} key] ${msg.model} ${Date.now() - started} ms, in ${msg.usage.input_tokens} / out ${msg.usage.output_tokens} tokens, stop=${msg.stop_reason}`,
    );
  }

  // Joins the text blocks of a reply; an empty answer is an error.
  private replyText(
    label: string,
    msg: Anthropic.Beta.Messages.BetaMessage,
  ): string {
    const text = msg.content
      .filter(
        (b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text',
      )
      .map((b) => b.text)
      .join('');
    if (!text.trim())
      throw new AppException(`The LLM returned an empty ${label} answer.`, 502);
    return text;
  }

  private async complete(
    ctx: LlmContextI,
    label: string,
    system: string,
    user: string,
    maxTokens: number,
    schema: Record<string, unknown> | null,
  ): Promise<string> {
    const apiKey = this.requireKey(ctx);
    const withFormat = !!schema && this.useFormat;
    const params: StreamParams = {
      model: this.model,
      max_tokens: maxTokens,
      system:
        schema && !withFormat
          ? `${system}\n\nRespond with only a JSON object that matches this JSON Schema, and nothing else:\n${JSON.stringify(schema)}`
          : system,
      messages: [{ role: 'user', content: user }],
      output_config: {
        effort: this.effort,
        ...(withFormat
          ? { format: { type: 'json_schema' as const, schema: schema! } }
          : {}),
      },
      ...this.fallbackParams(),
    };

    const started = Date.now();
    try {
      const msg = await this.client(apiKey)
        .beta.messages.stream(params)
        .finalMessage();
      this.logUsage(label, ctx, msg, started);
      if (msg.stop_reason === 'refusal') {
        throw new AppException(
          `The LLM declined the ${label} request${msg.stop_details?.explanation ? `: ${msg.stop_details.explanation}` : '.'}`,
          502,
        );
      }
      if (msg.stop_reason === 'max_tokens')
        throw new AppException(
          `The LLM's ${label} answer was cut off (output limit reached).`,
          502,
        );
      return this.replyText(label, msg);
    } catch (err) {
      if (err instanceof AppException) throw err;
      if (err instanceof Anthropic.BadRequestError) {
        // If this model or platform rejects an optional feature, turn it off and retry without it.
        const message = err.message.toLowerCase();
        if (this.useFallbacks && message.includes('fallback')) {
          this.logger.warn(
            'LlmService: server-side fallbacks not accepted here; disabling them.',
          );
          this.useFallbacks = false;
          return this.complete(ctx, label, system, user, maxTokens, schema);
        }
        if (
          withFormat &&
          (message.includes('output_config') ||
            message.includes('schema') ||
            message.includes('format'))
        ) {
          this.logger.warn(
            `LlmService: structured output format rejected (${err.message}); falling back to JSON-in-prompt.`,
          );
          this.useFormat = false;
          return this.complete(ctx, label, system, user, maxTokens, schema);
        }
        throw new AppException(
          `The LLM rejected the ${label} request: ${err.message}`,
          502,
        );
      }
      throw this.toAppException(err, ctx, label);
    }
  }

  // Maps an Anthropic SDK error to the HTTP error the web app should see.
  private toAppException(
    err: unknown,
    ctx: LlmContextI,
    label: string,
  ): AppException {
    if (err instanceof AppException) return err;
    const isUserKey = ctx.keySource === KeySource.User;
    const whose = isUserKey ? 'Your' : 'The server’s';
    // A bad user key is for the user to fix, so it gets a 401 and the web app asks for a new one.
    if (err instanceof Anthropic.AuthenticationError)
      return new AppException(
        `${whose} API key was rejected. ${isUserKey ? 'Update it in the key settings.' : 'Check the server key configuration.'}`,
        isUserKey ? 401 : 502,
      );
    if (err instanceof Anthropic.PermissionDeniedError)
      return new AppException(
        `${whose} API key cannot use the model this app needs.`,
        isUserKey ? 403 : 502,
      );
    if (err instanceof Anthropic.NotFoundError)
      return new AppException(
        `Model ${this.model} was not found. Set LLM_MODEL in api/.env.`,
        502,
      );
    if (err instanceof Anthropic.RateLimitError)
      return new AppException(
        'LLM rate limit reached. Please wait a minute and try again.',
        429,
      );
    if (err instanceof Anthropic.APIConnectionTimeoutError)
      return new AppException(
        `The LLM did not answer the ${label} request in time.`,
        504,
      );
    if (err instanceof Anthropic.APIConnectionError)
      return new AppException(
        'Could not reach the LLM service. Check the network connection.',
        502,
      );
    if (err instanceof Anthropic.APIError)
      return new AppException(
        `LLM service error ${err.status ?? ''} during ${label}: ${err.message}`,
        502,
      );
    return new AppException(
      `Unexpected error calling the LLM for ${label}: ${(err as Error).message}`,
      502,
    );
  }

  /**
   * Text answer using Anthropic's server-side web_search tool, localised to a country and optionally a city.
   * Web search returns citations, which can't be combined with structured output, so callers parse the JSON.
   */
  async searchWeb(
    ctx: LlmContextI,
    label: string,
    system: string,
    user: string,
    location: { country: string; city?: string | null } | null,
    maxSearches = 8,
  ): Promise<string> {
    const apiKey = this.requireKey(ctx);
    const tools = [
      {
        type: 'web_search_20260209' as const,
        name: 'web_search' as const,
        max_uses: maxSearches,
        ...(location
          ? {
              user_location: {
                type: 'approximate' as const,
                country: location.country,
                ...(location.city ? { city: location.city } : {}),
              },
            }
          : {}),
      },
    ];
    let messages: Anthropic.Beta.Messages.BetaMessageParam[] = [
      { role: 'user', content: user },
    ];
    const started = Date.now();
    try {
      for (let turn = 0; turn < 4; turn++) {
        const msg = await this.client(apiKey)
          .beta.messages.stream({
            model: this.model,
            max_tokens: 16000,
            system,
            messages,
            tools,
            output_config: { effort: this.effort },
            ...this.fallbackParams(),
          })
          .finalMessage();
        this.logUsage(label, ctx, msg, started);
        if (msg.stop_reason === 'pause_turn') {
          // The server paused a long search loop: send the turn back unchanged and it resumes.
          messages = [
            { role: 'user', content: user },
            {
              role: 'assistant',
              content:
                msg.content as unknown as Anthropic.Beta.Messages.BetaContentBlockParam[],
            },
          ];
          continue;
        }
        if (msg.stop_reason === 'refusal')
          throw new AppException(`The LLM declined the ${label} request.`, 502);
        return this.replyText(label, msg);
      }
      throw new AppException(`The LLM's ${label} search did not finish.`, 504);
    } catch (err) {
      // The search provider doesn't accept every country as a location (e.g. "NG"). Search again
      // without the location hint; the prompt already names the country and city.
      if (
        location &&
        err instanceof Anthropic.BadRequestError &&
        /not supported|user_location|country code/i.test(err.message)
      ) {
        this.logger.warn(
          `LlmService: search location ${location.country} not supported; searching without it.`,
        );
        return this.searchWeb(ctx, label, system, user, null, maxSearches);
      }
      if (
        err instanceof Anthropic.BadRequestError &&
        err.message.toLowerCase().includes('fallback') &&
        this.useFallbacks
      ) {
        this.useFallbacks = false;
        return this.searchWeb(ctx, label, system, user, location, maxSearches);
      }
      throw this.toAppException(err, ctx, label);
    }
  }
}

// Strips code fences or prose around a JSON object. Only needed when the format constraint is unavailable.
export function extractJson(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) return trimmed;
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  return start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
}
