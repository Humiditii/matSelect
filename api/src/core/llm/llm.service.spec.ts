import { ConfigService } from '@nestjs/config';
import { KeySource } from 'src/common/interface/main.interface';
import { AppLoggerService } from 'src/common/logging/logging.service';
import { LlmService, looksLikeKey } from './llm.service';

const createService = (env: Record<string, string>) =>
  new LlmService(
    { get: (k: string) => env[k] } as unknown as ConfigService,
    {
      log: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    } as unknown as AppLoggerService,
  );

const USER = 'sk-ant-user-key-0123456789abcdefghij';
const SERVER = 'sk-ant-server-key-0123456789abcdefgh';

describe('LlmService key resolution', () => {
  it('uses the server key when configured, ignoring a user key', () => {
    const llm = createService({ ANTHROPIC_API_KEY: SERVER });
    expect(llm.resolve(USER)).toEqual({
      apiKey: SERVER,
      keySource: KeySource.Server,
    });
    expect(llm.hasServerKey).toBe(true);
  });
  it("uses the user's key when the server has none", () => {
    const llm = createService({});
    expect(llm.resolve(USER)).toEqual({
      apiKey: USER,
      keySource: KeySource.User,
    });
    expect(llm.hasServerKey).toBe(false);
  });
  it('falls back to demo data when there is no usable key', () => {
    const llm = createService({});
    expect(llm.resolve(undefined)).toEqual({
      apiKey: null,
      keySource: KeySource.None,
    });
    expect(llm.resolve('not-a-key')).toEqual({
      apiKey: null,
      keySource: KeySource.None,
    });
  });
  it('LLM_PROVIDER=mock forces demo data', () => {
    const llm = createService({
      ANTHROPIC_API_KEY: SERVER,
      LLM_PROVIDER: 'mock',
    });
    expect(llm.resolve(USER).keySource).toBe(KeySource.None);
    expect(llm.hasServerKey).toBe(false);
  });
  it('recognises Claude key shapes', () => {
    expect(looksLikeKey(USER)).toBe(true);
    expect(looksLikeKey('sk-ant-short')).toBe(false);
    expect(looksLikeKey('sk-proj-0123456789abcdefghij0123')).toBe(false);
  });
});
