/**
 * HTTP-level tests: the real AppModule against a throwaway MongoDB database, with Claude replaced by a stub
 * whose outputs still pass through the real zod schemas. Needs MongoDB on 127.0.0.1:27017.
 *
 * Covers acceptance #1 (mock end-to-end), #7 (400 / per-family failure / 502), 404s, explanation caching,
 * and the key rules: server key → user key (header) → demo data.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Connection } from 'mongoose';
import request from 'supertest';
import { AppException } from 'src/common/appResponse.parser';
import { CONFIGS } from 'src/common/constants/configs.constant';
import { KeySource, LlmContextI } from 'src/common/interface/main.interface';
import type { StructuredCallI } from 'src/core/llm/interface/llm.interface';

Object.assign(process.env, {
  DB_URL: `mongodb://127.0.0.1:27017/matselect_test_${process.pid}`,
  ANTHROPIC_API_KEY: '',
  LLM_PROVIDER: '',
  MC_SAMPLES: '200',
  RATE_LIMIT_PER_MIN: '1000',
  NODE_ENV: 'prod', // keeps the logger quiet in test output
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { AppModule } = require('src/app.module');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { LlmService } = require('src/core/llm/llm.service');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { MOCK_MATERIALS } = require('src/core/llm/mock/mock.materials');

const GOOD_KEY = 'sk-ant-test-user-key-0123456789abcdef';
const BAD_KEY = 'sk-ant-rejected-key-0123456789abcdef';

/** Claude stub with the real key rules: no server key, so a user key in the header is used; else demo data. */
class StubLlm {
  model = 'stub';
  hasServerKey = false;
  failFamilies = new Set<string>();
  textCalls = 0;
  resolve(userKey?: string): LlmContextI {
    return userKey?.startsWith('sk-ant-')
      ? { apiKey: userKey, keySource: KeySource.User }
      : { apiKey: null, keySource: KeySource.None };
  }
  isLive(ctx: LlmContextI) {
    return !!ctx.apiKey;
  }
  async verifyKey(apiKey: string) {
    return {
      valid: apiKey === GOOD_KEY,
      model: 'stub',
      message: apiKey === GOOD_KEY ? 'ok' : 'rejected',
    };
  }
  async structured<T>(ctx: LlmContextI, call: StructuredCallI<T>): Promise<T> {
    if (ctx.apiKey === BAD_KEY)
      throw new AppException(
        'Your Claude API key was rejected. Update it in the key settings.',
        401,
      );
    if (!call.label.startsWith('candidates:'))
      throw new Error(`unexpected structured call ${call.label}`);
    const family = call.label.split(':')[1];
    if (this.failFamilies.has(family))
      throw new AppException(`stub failure for ${family}`, 502);
    const r = (x: [number, number] | null) =>
      x ? { min: x[0], max: x[1] } : null;
    const materials = MOCK_MATERIALS.filter(
      (m: { family: string }) => m.family === family,
    ).map((m: Record<string, any>) => ({
      ...m,
      ...Object.fromEntries(
        [
          'density',
          'E',
          'G',
          'strength',
          'Kic',
          'tMax',
          'tMin',
          'lambda',
          'alpha',
          'price',
        ].map((k) => [k, r(m[k])]),
      ),
      customRatings: [],
      extraProperties: [],
    }));
    return call.parse.parse({ materials });
  }
  async text(): Promise<string> {
    this.textCalls++;
    return '## Pick\n\nUse the top pick. Values are AI-estimated; verify with datasheets.';
  }
}

const spec = {
  title: 'Shelf',
  component: 'beam',
  load: { value: 30, unit: 'kg' },
  length: { value: 0.9, unit: 'm' },
  maxDeflection: { value: 4.5, unit: 'mm' },
  support: 'simply_supported_uniform',
  section: 'rect_fixed_width',
  sectionWidth: { value: 250, unit: 'mm' },
  requiredProcesses: ['woodwork', 'drill'],
};
const H = CONFIGS.USER_KEY_HEADER;

describe('MatSelect API', () => {
  let app: INestApplication;
  const llm = new StubLlm();
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(LlmService)
      .useValue(llm)
      .compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    app.setGlobalPrefix('api');
    await app.init();
  });
  afterAll(async () => {
    await app.get<Connection>(getConnectionToken()).dropDatabase();
    await app.close();
  });

  it('GET /health uses the success envelope and reports key handling', async () => {
    const r = await http().get('/api/health').expect(200);
    expect(r.body).toMatchObject({
      status: true,
      statusCode: 200,
      message: 'success',
    });
    expect(r.body.data).toMatchObject({
      status: 'ok',
      llmProvider: 'mock',
      serverHasKey: false,
      acceptsUserKey: true,
      database: 'connected',
    });
  });

  it('invalid bodies → 400 with the error envelope and issues', async () => {
    const r = await http()
      .post('/api/specs/extract')
      .send({ text: 'hi', audience: 'wizard' })
      .expect(400);
    expect(r.body).toMatchObject({ error: 400, path: '/api/specs/extract' });
    expect(r.body.issues.length).toBe(2);
    const r2 = await http()
      .post('/api/selections')
      .send({ spec: { title: '', component: 'girder' } })
      .expect(400);
    expect(r2.body.issues.map((i: { path: string }) => i.path)).toEqual(
      expect.arrayContaining(['spec.title', 'spec.component']),
    );
  });

  it('unknown unit → 400 listing the supported units', async () => {
    const r = await http()
      .post('/api/selections')
      .send({ spec: { ...spec, length: { value: 3, unit: 'furlong' } } })
      .expect(400);
    expect(r.body.issues[0]).toMatchObject({ path: 'spec.length' });
    expect(r.body.issues[0].message).toMatch(/mm, cm, m, in, ft/);
  });

  it('no key anywhere → demo data end to end (acceptance #1)', async () => {
    const ex = await http()
      .post('/api/specs/extract')
      .send({ text: 'A bookshelf board 90 cm long holding 30 kg of books' })
      .expect(200);
    expect(ex.body.data.dataSource).toBe('mock');
    const r = await http()
      .post('/api/selections')
      .send({ spec: ex.body.data.spec })
      .expect(201);
    expect(r.body.data).toMatchObject({
      dataSource: 'mock',
      keySource: 'none',
      mode: 'sizing',
    });
    expect(r.body.data.ranking.length).toBeGreaterThan(0);
    const ex2 = await http()
      .post(`/api/selections/${r.body.data.id}/explain`)
      .send({ audience: 'engineer' })
      .expect(200);
    expect(ex2.body.data).toMatchObject({
      audience: 'engineer',
      grounded: true,
      dataSource: 'mock',
    });
  });

  it("the user's own key (header) is used when the server has none; a failed family is skipped", async () => {
    llm.failFamilies = new Set(['ceramic_glass']);
    const r = await http()
      .post('/api/selections')
      .set(H, GOOD_KEY)
      .send({ spec })
      .expect(201);
    llm.failFamilies = new Set();
    const d = r.body.data;
    expect(d).toMatchObject({ dataSource: 'llm', keySource: 'user' });
    expect(d.warnings.join(' ')).toMatch(
      /ceramics & glass candidates .* skipped/,
    );
    expect(
      d.materials.some((m: { family: string }) => m.family === 'ceramic_glass'),
    ).toBe(false);

    const expected = MOCK_MATERIALS.filter(
      (m: { family: string }) => m.family !== 'ceramic_glass',
    ).length;
    const list = await http().get('/api/selections').expect(200);
    expect(list.body.data[0]).toMatchObject({
      id: d.id,
      title: 'Shelf',
      candidates: expected,
    });

    // Explanations are generated once per audience, then cached.
    const before = llm.textCalls;
    await http()
      .post(`/api/selections/${d.id}/explain`)
      .set(H, GOOD_KEY)
      .send({ audience: 'engineer' })
      .expect(200);
    await http()
      .post(`/api/selections/${d.id}/explain`)
      .set(H, GOOD_KEY)
      .send({ audience: 'engineer' })
      .expect(200);
    expect(llm.textCalls).toBe(before + 1);
  });

  it('a rejected user key → 401 so the web app can ask for a new one', async () => {
    const r = await http()
      .post('/api/selections')
      .set(H, BAD_KEY)
      .send({ spec })
      .expect(401);
    expect(r.body.message).toMatch(/rejected/);
  });

  it('all families failing → 502 with a readable message', async () => {
    llm.failFamilies = new Set([
      'metal',
      'polymer',
      'ceramic_glass',
      'composite',
      'wood_natural',
      'foam_elastomer',
    ]);
    const r = await http()
      .post('/api/selections')
      .set(H, GOOD_KEY)
      .send({ spec })
      .expect(502);
    expect(r.body.message).toMatch(/could not supply candidate materials/);
    llm.failFamilies = new Set();
  });

  it('POST /api-key/verify checks a key without storing it', async () => {
    const ok = await http()
      .post('/api/api-key/verify')
      .send({ apiKey: GOOD_KEY })
      .expect(200);
    expect(ok.body.data).toMatchObject({ valid: true, serverHasKey: false });
    const bad = await http()
      .post('/api/api-key/verify')
      .send({ apiKey: BAD_KEY })
      .expect(200);
    expect(bad.body.data.valid).toBe(false);
    await http().post('/api/api-key/verify').send({}).expect(400);
  });

  it('unknown ids → 404', async () => {
    const r = await http()
      .get('/api/selections/3f1c2b9e-1111-4aaa-8bbb-123456789abc')
      .expect(404);
    expect(r.body.message).toMatch(/No selection/);
    await http().get('/api/selections/..%2F..%2Fetc%2Fpasswd').expect(404);
  });
});
