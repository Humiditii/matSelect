/**
 * HTTP tests: the real AppModule against a throwaway MongoDB database, with Claude replaced by a stub whose
 * output still goes through the real zod schemas. Needs MongoDB on 127.0.0.1:27017.
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
  // Keeps the logger quiet in test output.
  NODE_ENV: 'prod',
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { AppModule } = require('src/app.module');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { LlmService } = require('src/core/llm/llm.service');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { MOCK_MATERIALS } = require('src/core/llm/mock/mock.materials');

const GOOD_KEY = 'sk-ant-test-user-key-0123456789abcdef';
const BAD_KEY = 'sk-ant-rejected-key-0123456789abcdef';

// Claude stub with the real key rules. There is no server key, so a user key in the header is used, else demo data.
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
    const toMinMax = (x: [number, number] | null) =>
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
          'co2',
          'embodiedEnergy',
        ].map((k) => [k, toMinMax(m[k])]),
      ),
      customRatings: [],
      extraProperties: [],
    }));
    return call.parse.parse({ materials });
  }
  searchCalls = 0;
  async searchWeb(): Promise<string> {
    this.searchCalls++;
    return (
      'Here is what I found:\n```json\n' +
      JSON.stringify({
        items: [
          {
            name: 'x',
            availability: 'widely available',
            forms: ['board'],
            suppliers: [
              {
                name: 'Lagos Timber Market',
                url: 'https://example-timber.ng/products',
                note: 'Pine boards',
              },
              { name: 'Made-up Ltd', url: 'not a url', note: '' },
            ],
            notes: 'Common locally.',
          },
        ],
      }) +
      '\n```'
    );
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
const KEY_HEADER = CONFIGS.USER_KEY_HEADER;

describe('MatSelect API', () => {
  let app: INestApplication;
  const llm = new StubLlm();
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(LlmService)
      .useValue(llm)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    app.setGlobalPrefix('api');
    await app.init();
  });
  afterAll(async () => {
    await app.get<Connection>(getConnectionToken()).dropDatabase();
    await app.close();
  });

  it('GET /health uses the success envelope and reports key handling', async () => {
    const res = await http().get('/api/health').expect(200);
    expect(res.body).toMatchObject({
      status: true,
      statusCode: 200,
      message: 'success',
    });
    expect(res.body.data).toMatchObject({
      status: 'ok',
      llmProvider: 'mock',
      serverHasKey: false,
      acceptsUserKey: true,
      database: 'connected',
    });
  });

  it('returns 400 with the error envelope and issues for invalid bodies', async () => {
    const res = await http()
      .post('/api/specs/extract')
      .send({ text: 'hi', audience: 'wizard' })
      .expect(400);
    expect(res.body).toMatchObject({ error: 400, path: '/api/specs/extract' });
    expect(res.body.issues.length).toBe(2);
    const selectionRes = await http()
      .post('/api/selections')
      .send({ spec: { title: '', component: 'girder' } })
      .expect(400);
    expect(
      selectionRes.body.issues.map((i: { path: string }) => i.path),
    ).toEqual(expect.arrayContaining(['spec.title', 'spec.component']));
  });

  it('returns 400 listing the supported units for an unknown unit', async () => {
    const res = await http()
      .post('/api/selections')
      .send({ spec: { ...spec, length: { value: 3, unit: 'furlong' } } })
      .expect(400);
    expect(res.body.issues[0]).toMatchObject({ path: 'spec.length' });
    expect(res.body.issues[0].message).toMatch(/mm, cm, m, in, ft/);
  });

  it('uses demo data end to end when there is no key anywhere', async () => {
    const extracted = await http()
      .post('/api/specs/extract')
      .send({ text: 'A bookshelf board 90 cm long holding 30 kg of books' })
      .expect(200);
    expect(extracted.body.data.dataSource).toBe('mock');
    const res = await http()
      .post('/api/selections')
      .send({ spec: extracted.body.data.spec })
      .expect(201);
    expect(res.body.data).toMatchObject({
      dataSource: 'mock',
      keySource: 'none',
      mode: 'sizing',
    });
    expect(res.body.data.ranking.length).toBeGreaterThan(0);
    const explained = await http()
      .post(`/api/selections/${res.body.data.id}/explain`)
      .send({ audience: 'engineer' })
      .expect(200);
    expect(explained.body.data).toMatchObject({
      audience: 'engineer',
      grounded: true,
      dataSource: 'mock',
    });
  });

  it("the user's own key (header) is used when the server has none; a failed family is skipped", async () => {
    llm.failFamilies = new Set(['ceramic_glass']);
    const res = await http()
      .post('/api/selections')
      .set(KEY_HEADER, GOOD_KEY)
      .send({ spec })
      .expect(201);
    llm.failFamilies = new Set();
    const result = res.body.data;
    expect(result).toMatchObject({ dataSource: 'llm', keySource: 'user' });
    expect(result.warnings.join(' ')).toMatch(
      /ceramics & glass candidates .* skipped/,
    );
    expect(
      result.materials.some(
        (m: { family: string }) => m.family === 'ceramic_glass',
      ),
    ).toBe(false);

    const expected = MOCK_MATERIALS.filter(
      (m: { family: string }) => m.family !== 'ceramic_glass',
    ).length;
    const list = await http().get('/api/selections').expect(200);
    expect(list.body.data[0]).toMatchObject({
      id: result.id,
      title: 'Shelf',
      candidates: expected,
    });

    // Explanations are generated once per audience, then cached.
    const before = llm.textCalls;
    await http()
      .post(`/api/selections/${result.id}/explain`)
      .set(KEY_HEADER, GOOD_KEY)
      .send({ audience: 'engineer' })
      .expect(200);
    await http()
      .post(`/api/selections/${result.id}/explain`)
      .set(KEY_HEADER, GOOD_KEY)
      .send({ audience: 'engineer' })
      .expect(200);
    expect(llm.textCalls).toBe(before + 1);
  });

  it('returns 401 for a rejected user key so the web app can ask for a new one', async () => {
    const res = await http()
      .post('/api/selections')
      .set(KEY_HEADER, BAD_KEY)
      .send({ spec })
      .expect(401);
    expect(res.body.message).toMatch(/rejected/);
  });

  it('returns 502 with a readable message when all families fail', async () => {
    llm.failFamilies = new Set([
      'metal',
      'polymer',
      'ceramic_glass',
      'composite',
      'wood_natural',
      'foam_elastomer',
    ]);
    const res = await http()
      .post('/api/selections')
      .set(KEY_HEADER, GOOD_KEY)
      .send({ spec })
      .expect(502);
    expect(res.body.message).toMatch(/could not supply candidate materials/);
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

  it('sourcing: demo guidance without a key, live search with one, cached per country', async () => {
    const res = await http().post('/api/selections').send({ spec }).expect(201);
    const id = res.body.data.id;

    const demo = await http()
      .post(`/api/selections/${id}/sourcing`)
      .send({ country: 'NG' })
      .expect(200);
    expect(demo.body.data).toMatchObject({
      country: 'NG',
      countryName: 'Nigeria',
      dataSource: 'mock',
    });
    expect(demo.body.data.items.length).toBe(
      Math.min(3, res.body.data.ranking.length),
    );
    expect(demo.body.data.items[0].searchLinks[0].url).toMatch(
      /^https:\/\/www\.google\.com\/search\?q=.*Nigeria/,
    );

    const live = await http()
      .post(`/api/selections/${id}/sourcing`)
      .set(KEY_HEADER, GOOD_KEY)
      .send({ country: 'NG', city: 'Lagos' })
      .expect(200);
    expect(live.body.data).toMatchObject({ dataSource: 'llm', city: 'Lagos' });
    expect(live.body.data.items[0].suppliers).toEqual([
      {
        name: 'Lagos Timber Market',
        url: 'https://example-timber.ng/products',
        note: 'Pine boards',
      },
    ]);
    const calls = llm.searchCalls;
    await http()
      .post(`/api/selections/${id}/sourcing`)
      .set(KEY_HEADER, GOOD_KEY)
      .send({ country: 'NG', city: 'Lagos' })
      .expect(200);
    // The second request is served from the saved result.
    expect(llm.searchCalls).toBe(calls);

    await http()
      .post(`/api/selections/${id}/sourcing`)
      .send({ country: 'Nigeria' })
      .expect(400);
  });

  it('returns 404 for unknown ids', async () => {
    const res = await http()
      .get('/api/selections/3f1c2b9e-1111-4aaa-8bbb-123456789abc')
      .expect(404);
    expect(res.body.message).toMatch(/No selection/);
    await http().get('/api/selections/..%2F..%2Fetc%2Fpasswd').expect(404);
  });
});
