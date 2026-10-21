# Developer guide — how MatSelect works and how to change it

This is a practical map for modifying the app. For running it, see [README.md](README.md).

> **Backend internals** (modules, request lifecycle, key handling, engine maths, errors, persistence) are documented in detail in **[api/README.md](api/README.md)**. This guide is the quick map plus recipes.

## 1. What happens when you press a button

```
web/app/page.tsx                    api/src/core/…
 "Continue"  ── POST /api/specs/extract ──▶ spec/spec.service.ts  extractSpec()
                                            ├─ demo:   llm/mock/mock.data.ts  mockExtract()   (keyword rules)
                                            └─ Claude: llm/prompts/llm.prompts.ts EXTRACTION_SYSTEM (+ llm/outputs/llm.outputs.ts)
 Brief (components/BriefEditor.tsx) — the user corrects it
 "Find materials" ── POST /api/selections ─▶ selection/selection.service.ts  createSelection()
                                            1. candidates  material/material.service.ts (Claude per family, or llm/mock/mock.materials.ts)
                                            2. engine      src/engine/pipeline.ts runSelection()   ← all the maths
                                            3. explanation explanation/explanation.service.ts + selection/util/grounding.util.ts
                                            4. save        selection/repository (Mongoose → collection material_selections)
 Results page (components/ResultsView.tsx) ◀── GET /api/selections/:id
 Audience toggle ── POST /api/selections/:id/explain (cached per audience)
 Key badge (components/StatusPill.tsx + ApiKeyDialog.tsx) ── POST /api/api-key/verify
```

Every request that may call Claude carries the user's own key in the `x-anthropic-api-key` header if they saved one (`web/lib/apiKey.ts`). The server uses its own key first, then the user's, then demo data.

## 2. Where the results come from

| Mode | When | Requirements | Materials | Explanation |
|---|---|---|---|---|
| **Demo** | no server key and no user key | Keyword rules in `api/src/core/llm/mock/mock.data.ts` | 67 curated materials in `api/src/core/llm/mock/mock.materials.ts` | Template in `mock.data.ts` |
| **Claude** | server key in `api/.env`, or the user's own key from the web app | Claude reads your text | Claude lists 10 per family with property ranges and references | Claude writes it; code checks every number |

In **both** modes the ranking, sizes, masses, costs, probabilities and "why not" reasons are calculated by `api/src/engine/` — never by the AI. The badge in the top-right corner shows which mode is on.

## 3. Folder map

```
api/src/
  main.ts / app.module.ts   bootstrap (filter, ValidationPipe, /api, CORS, Swagger) and module wiring
  common/                   shared: AppResponse/AppException, BaseRepository, global filter, logger,
                            HttpLogger, configs, domain/domain.types.ts ★ (the data model, zod)
  core/<feature>/           NestJS feature modules — controller, service, swagger, dto/, schema/, repository/
    llm/                    Claude client, prompts ★, output schemas, demo data ★
    spec/ material/ explanation/ selection/ apiKey/
  engine/                   ★ pure calculations, no AI — unit tested
api/test/                   HTTP end-to-end tests
web/
  app/page.tsx             describe → brief → progress
  app/results/[id]/page.tsx  results
  app/tutorial/page.tsx    the tutorial
  components/              BriefEditor, SpecEditor (fine-tune), ResultsView, ApiKeyDialog, StatusPill, ui
  lib/                     api.ts (fetch + envelope), apiKey.ts (browser key storage), types.ts ★ (mirror of
                           domain.types.ts), labels.ts ★ (all wording)
```

## 4. Common changes (recipes)

After any API change the dev server reloads by itself; run `npm test` before you finish.

### Change wording, icons or the example chips
`web/lib/labels.ts` — e.g. `EXAMPLES`, `COMPONENT_LABEL`, `ENV_LABEL`, `PROCESS_LABEL`. Nothing else needs touching.

### Add or edit a demo material
`api/src/core/llm/mock/mock.materials.ts`. One line per material:

```ts
m('metal', 'Name', 'Grade', { rho: [min, max], E: [...], G: [...], s: [...], K: [...], tmax: [...], tmin: [...], lam: [...], a: [...], c: [...] },
  'bti',      // flags: b=brittle t=transparent i=electrical insulator
  'ABAC',     // ratings: fresh water, salt water, UV, chemicals (A best … E worst, - unknown)
  'pggggpggdnnn', // 12 process ratings in this order: hand_cut power_cut drill machine weld glue fasten bend cast mould print_3d woodwork (g/p/d/n)
  ['bar', 'tube'], 'One-line note.', 'high')
```
Units: density kg/m³, E/G GPa, strength MPa, K MPa·√m, temperatures °C, λ W/m·K, α µstrain/K, price USD/kg. Use `null` for unknown. The test in `mock.spec.ts` checks there are 10 per family and that every value is plausible.

### Change safety factors or durability thresholds
- Safety factors: `DEFAULT_SAFETY_FACTORS` in `api/src/common/domain/domain.types.ts` (and the copy in `web/lib/types.ts`).
- What each environment requires: `ENV_REQUIREMENTS` in `api/src/engine/pipeline.ts`.
- Minimum rating for user-typed environments: `CUSTOM_ENV_MIN` in the same file.
- Plausibility bounds: `BOUNDS` in `api/src/engine/validate.ts`.
- Monte Carlo samples: `MC_SAMPLES` in `api/.env`.

### Change what Claude is told
`api/src/core/llm/prompts/llm.prompts.ts`. Extraction rules are in `EXTRACTION_SYSTEM`, candidate instructions in `CANDIDATE_SYSTEM`/`candidateUser`, explanation style per audience in `AUDIENCE_STYLE`. If you ask Claude for a new field, also add it to `core/llm/outputs/llm.outputs.ts` (both the JSON schema and the zod validator).

### Change the AI model
`LLM_MODEL` and `LLM_EFFORT` in `api/.env`, then restart.

### Add a new built-in environment (e.g. "freezer")
1. `ENVIRONMENTS` in `api/src/common/domain/domain.types.ts` and `web/lib/types.ts`.
2. Its requirement in `ENV_REQUIREMENTS` (`engine/pipeline.ts`) — reuse a rating field or add one to `RatingsSchema` (then also to `CANDIDATE_SCHEMA` and every demo material).
3. Labels: `ENV_LABEL` in `api/src/engine/labels.ts` and `web/lib/labels.ts`.
4. Optional: keyword in `engine/environments.ts` (demo mapping) and in `mockExtract` (`mock.ts`).
(Users can already type any environment they like — see section 5.)

### Add a tool / process
`PROCESSES` in both `types.ts` files, `PROCESS_LABEL` in both `labels.ts` files, add a 13th letter to every demo material's process string, and a keyword in `TOOL_WORDS` (`mock.ts`).

### Add a new kind of part (component)
1. `COMPONENTS` in both `types.ts`.
2. Its index in `deriveIndices()` (`engine/physics.ts`); if it can be sized, a case in `sizePart()` and `SIZING_COMPONENTS` in `pipeline.ts`.
3. `COMPONENT_LABEL` in `web/lib/labels.ts`.
4. A unit test in `engine/engine.spec.ts` with a hand-calculated answer.

### Add a field to the requirements
1. `DesignSpec` in `api/src/common/domain/domain.types.ts` (give it a `.default(...)` so old saved results still load).
2. `DesignSpec` in `web/lib/types.ts`.
3. A control in `web/components/SpecEditor.tsx`.
4. Use it in `engine/pipeline.ts` (screening or sizing) and, if Claude should fill it, in `EXTRACTION_SCHEMA` + `ExtractionOutput` + the prompt.

## 5. General parts and the short brief

- **Structural parts** (beam, tie, column, shaft) can be sized from a load and a length — those are the only questions ever asked, and they are optional.
- **Everything else** is component `custom`. The brief holds:
  - `function` — one sentence;
  - `propertyLimits` — hard requirements on any property, e.g. `{ property: 'tMax', min: 400, reason: '…' }`;
  - `customProperties` — application-specific properties (friction coefficient, wear rate, hardness…). Claude supplies values for every candidate (`Material.extra`);
  - `customObjective` — the index to maximise, as property powers, e.g. `[{ property: 'wear_rate', exponent: -1 }]`.
- The confirm page is `web/components/BriefEditor.tsx`; the full form (`SpecEditor.tsx`) is folded under "Fine-tune every detail".
- "Anything else?" re-runs extraction on the description plus the new sentence (`refine()` in `web/app/page.tsx`).
- **Demo profiles** live in `mockExtract()` (`api/src/core/llm/mock/mock.data.ts`): brake pad, heat sink, and a generic "what matters most?" question for anything unknown. To add one, add a `Kind`, a keyword in `kindOf()` and a `case` that sets `function`, `propertyLimits` and `customObjective`. If it needs a custom property, give some demo materials values for it via the last argument of `m()` in `mock.materials.ts` (see the friction materials); otherwise demo mode drops that requirement and says so (`demoAdjust()`).
- With Claude, the extraction prompt (`EXTRACTION_SYSTEM` in `prompts.ts`) does this translation for any part; edit its examples to steer it.

## 6. Custom environments (typed by the user)

Users can add conditions that aren't in the list (e.g. "next to a chlorinated pool") in the Confirm form or as an "Other" answer to the environment question.
- **Claude mode:** Claude rates every candidate material for each one (A–E). The engine requires **B or better** (`CUSTOM_ENV_MIN`); unknown ratings send the material to "Not evaluated" — they are never guessed.
- **Demo mode:** the text is matched to the closest built-in conditions (`engine/environments.ts`, e.g. "pool" → wet + chemicals) and the results page says so; if nothing matches, it says the condition was not checked.

## 7. Testing and debugging

```bash
npm test
```
- `engine/engine.spec.ts` — formulas, indices, screening (hand-checked numbers).
- `core/selection/util/grounding.spec.ts` — explanation number check.
- `core/llm/llm.service.spec.ts` — which key a request uses.
- `core/llm/mock/mock.spec.ts` — demo extraction and demo data.
- `api/test/selection.e2e-spec.ts` — the HTTP API with a fake Claude (`npm run test:e2e`, needs MongoDB).

Useful while debugging:
- `http://localhost:4000/api/health` — mode, model and database in use.
- The API terminal logs every Claude call with time and tokens.
- Inspect saved results: `mongosh matselect --eval 'db.selections.find({}, {"spec.title":1, createdAt:1}).sort({createdAt:-1}).limit(5)'`
- Delete all saved results: `mongosh matselect --eval 'db.selections.deleteMany({})'`
