/**
 * Claude wrapper: structured (JSON-schema constrained) calls and plain-text calls.
 *
 * Which key is used is decided per request (see `resolve`):
 *   1. the server's ANTHROPIC_API_KEY, if configured;
 *   2. otherwise a key the user supplied from the web app (header `x-anthropic-api-key`);
 *   3. otherwise none → callers use the built-in demo (mock) data.
 * User keys are only held in memory for the request (and an LRU of clients); never stored or logged.
 *
 * DECISION: the spec asks for a "forced tool call". Current Claude models reject forced tool_choice, so
 * structured outputs (`output_config.format`) are used instead — same guarantee (schema-valid JSON),
 * fewer moving parts. Everything returned is still validated with zod, with one corrective retry.
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

/** Claude keys start with "sk-ant-"; anything else is rejected before a network call. */
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
    this.model = this.configService.get<string>('LLM_MODEL') || CONFIGS.DEFAULT_LLM_MODEL;
    this.effort = (this.configService.get<string>('LLM_EFFORT') as Effort) || (CONFIGS.DEFAULT_LLM_EFFORT as Effort);
    this.timeout = Number(this.configService.get('LLM_TIMEOUT_MS')) || CONFIGS.DEFAULT_LLM_TIMEOUT;
    const fallbacks = this.configService.get<string>('LLM_FALLBACKS');
    this.useFallbacks = fallbacks
      ? ['true', '1', 'on', 'yes'].includes(fallbacks)
      : FALLBACK_MODELS.test(this.model);
  }

  /** True when the server itself has a key (users then never need their own). */
  get hasServerKey(): boolean {
    return !!this.serverKey && !this.forceMock;
  }

  /** Decide which key this request uses: server key → user key → none (demo data). */
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
        message:
          'That does not look like a Claude API key (it should start with "sk-ant-").',
      };
    }
    try {
      await this.client(apiKey.trim()).models.retrieve(this.model);
      return {
        valid: true,
        model: this.model,
        message: `Key works with ${this.model}.`,
      };
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError)
        return {
          valid: false,
          model: this.model,
          message:
            'This key was rejected by Anthropic. Check it was copied completely.',
        };
      if (
        err instanceof Anthropic.PermissionDeniedError ||
        err instanceof Anthropic.NotFoundError
      )
        return {
          valid: false,
          model: this.model,
          message: `This key cannot use the model ${this.model}.`,
        };
      if (err instanceof Anthropic.APIConnectionError)
        throw new AppException(
          'Could not reach the Claude API to check the key. Check the network connection.',
          502,
        );
      throw new AppException(
        `Could not check the key: ${(err as Error).message}`,
        502,
      );
    }
  }

  /** JSON output constrained by `schema`, validated by `parse`; retried once with the validation errors. */
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
      const r = call.parse.safeParse(json);
      if (r.success) return r.data;
      errors = r.error.issues
        .slice(0, 20)
        .map((i) => `- ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      this.logger.warn(
        `LlmService: ${call.label} output failed validation (attempt ${attempt + 1})\n${errors}`,
      );
    }
    throw new AppException(
      `Claude's answer for ${call.label} did not match the expected format, even after a retry.`,
      502,
    );
  }

  /** Plain-text completion. */
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
    let c = this.clients.get(id);
    if (c) {
      this.clients.delete(id); // refresh LRU position
    } else {
      c = new Anthropic({ apiKey, timeout: this.timeout, maxRetries: 2 });
    }
    this.clients.set(id, c);
    while (this.clients.size > CONFIGS.USER_KEY_CLIENT_CACHE)
      this.clients.delete(this.clients.keys().next().value!);
    return c;
  }

  private async complete(
    ctx: LlmContextI,
    label: string,
    system: string,
    user: string,
    maxTokens: number,
    schema: Record<string, unknown> | null,
  ): Promise<string> {
    if (!ctx.apiKey)
      throw new AppException(
        'No Claude API key is available for this request.',
        400,
      );
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
      ...(this.useFallbacks
        ? {
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default' as const,
        }
        : {}),
    };

    const started = Date.now();
    const whose = ctx.keySource === KeySource.User ? 'Your' : 'The server’s';
    try {
      const msg = await this.client(ctx.apiKey)
        .beta.messages.stream(params)
        .finalMessage();
      this.logger.log(
        `LlmService: ${label} [${ctx.keySource} key] ${msg.model} ${Date.now() - started} ms, in ${msg.usage.input_tokens} / out ${msg.usage.output_tokens} tokens, stop=${msg.stop_reason}`,
      );
      if (msg.stop_reason === 'refusal') {
        throw new AppException(
          `Claude declined the ${label} request${msg.stop_details?.explanation ? `: ${msg.stop_details.explanation}` : '.'}`,
          502,
        );
      }
      if (msg.stop_reason === 'max_tokens')
        throw new AppException(
          `Claude's ${label} answer was cut off (output limit reached).`,
          502,
        );
      const text = msg.content
        .filter(
          (b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text',
        )
        .map((b) => b.text)
        .join('');
      if (!text.trim())
        throw new AppException(
          `Claude returned an empty ${label} answer.`,
          502,
        );
      return text;
    } catch (err) {
      if (err instanceof AppException) throw err;
      if (err instanceof Anthropic.BadRequestError) {
        // Degrade gracefully if this model/platform rejects an optional feature, then retry once without it.
        const m = err.message.toLowerCase();
        if (this.useFallbacks && m.includes('fallback')) {
          this.logger.warn(
            'LlmService: server-side fallbacks not accepted here; disabling them.',
          );
          this.useFallbacks = false;
          return this.complete(ctx, label, system, user, maxTokens, schema);
        }
        if (
          withFormat &&
          (m.includes('output_config') ||
            m.includes('schema') ||
            m.includes('format'))
        ) {
          this.logger.warn(
            `LlmService: structured output format rejected (${err.message}); falling back to JSON-in-prompt.`,
          );
          this.useFormat = false;
          return this.complete(ctx, label, system, user, maxTokens, schema);
        }
        throw new AppException(
          `Claude rejected the ${label} request: ${err.message}`,
          502,
        );
      }
      // A user's own key being wrong is their problem to fix → 401 so the web app can ask for a new one.
      if (err instanceof Anthropic.AuthenticationError)
        throw new AppException(
          `${whose} Claude API key was rejected. ${ctx.keySource === KeySource.User ? 'Update it in the key settings.' : 'Check ANTHROPIC_API_KEY in api/.env.'}`,
          ctx.keySource === KeySource.User ? 401 : 502,
        );
      if (err instanceof Anthropic.PermissionDeniedError)
        throw new AppException(
          `${whose} Claude API key cannot use model ${this.model}.`,
          ctx.keySource === KeySource.User ? 403 : 502,
        );
      if (err instanceof Anthropic.NotFoundError)
        throw new AppException(
          `Model ${this.model} was not found. Set LLM_MODEL in api/.env.`,
          502,
        );
      if (err instanceof Anthropic.RateLimitError)
        throw new AppException(
          'Claude rate limit reached. Please wait a minute and try again.',
          429,
        );
      if (err instanceof Anthropic.APIConnectionTimeoutError)
        throw new AppException(
          `Claude did not answer the ${label} request in time.`,
          504,
        );
      if (err instanceof Anthropic.APIConnectionError)
        throw new AppException(
          'Could not reach the Claude API. Check the network connection.',
          502,
        );
      if (err instanceof Anthropic.APIError)
        throw new AppException(
          `Claude API error ${err.status ?? ''} during ${label}: ${err.message}`,
          502,
        );
      throw new AppException(
        `Unexpected error calling Claude for ${label}: ${(err as Error).message}`,
        502,
      );
    }
  }
}

/** Strip code fences / prose around a JSON object (only needed when the format constraint is unavailable). */
export function extractJson(text: string): string {
  const t = text.trim();
  if (t.startsWith('{')) return t;
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  return start >= 0 && end > start ? t.slice(start, end + 1) : t;
}
