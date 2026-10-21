# MatSelect — AI material selection

Describe what you want to build — a shelf, a ladder, a brake pad, a heat sink, anything. MatSelect turns the description into a short brief (function, goal, requirements) using Ashby's method, asks Claude for candidate materials from every family and the research literature, then **calculates** which materials fit and which is best — and for load-bearing parts how big the part must be, what it weighs and costs — and explains the result for a craftsman, a member of the public or an engineer.

There are no long forms: the user writes a sentence, checks the brief, and can add requirements in plain words ("it must survive 600 °C", "under $20"). Every detail stays editable under "Fine-tune".

**Claude never ranks or filters.** It supplies the requirements draft, candidate materials and the final explanation. Fit, sizing and order come from a deterministic, unit-tested engine; every number in the explanation is checked against the calculation.

```
Next.js (web/)  ──REST──▶  NestJS (api/)  ──▶  Claude API
describe · confirm ·        extraction · candidates (6 parallel calls) ·
results · explanation       engine: indices, screening, sizing, Monte Carlo ·
                            grounding check · MongoDB persistence
```

- **Using the app:** open **How to use** in the app (`/tutorial`).
- **Backend internals:** **[api/README.md](api/README.md)** — every module, the request lifecycle, key handling, the engine's maths, errors and persistence. Swagger docs run at `http://localhost:4000/api-docs`.
- **Changing the app:** the **[developer guide](DEVELOPER_GUIDE.md)** — folder map and step-by-step recipes.

## Run it (native, no Docker)

Requirements: **Node.js 20+** and **MongoDB** running locally (e.g. `brew services start mongodb-community@7.0`).

```bash
npm run setup
```

```bash
npm run dev
```

Open http://localhost:3000. The API is at http://localhost:4000/api.

- **Demo mode** (no key anywhere): built-in extraction, 67 curated materials and template explanations. Everything works without a key and the UI shows a "Demo data" badge. The calculations are always real.
- **Your own key**: if the server has no key, anyone can click the badge in the top-right corner and paste their own Claude API key. It is kept in their browser, sent only with requests that need Claude, and never stored by the server.
- **Claude mode**: put your key in `api/.env` (`ANTHROPIC_API_KEY=…`) and restart. Model defaults to `claude-opus-5-5` (`LLM_MODEL`), effort `medium` (`LLM_EFFORT`).

Production: `npm run build` then `npm start`. Tests: `npm test`.

## Deploy to Render

`render.yaml` is a Render Blueprint that creates both services: `matselect-api` (NestJS) and `matselect-web` (Next.js). Render has no MongoDB, so the database runs on MongoDB Atlas.

1. **Database.** Create a free cluster at [MongoDB Atlas](https://www.mongodb.com/atlas). Add a database user, and under *Network Access* allow `0.0.0.0/0` (Render's free tier has no fixed IPs). Copy the connection string and add the database name: `mongodb+srv://USER:PASS@CLUSTER.mongodb.net/matselect`.
2. **Repository.** Push this folder to GitHub, GitLab or Bitbucket. `.gitignore` already excludes `api/.env`, `web/.env.local`, `node_modules`, build output and logs.
3. **Blueprint.** In Render: *New → Blueprint* → pick the repository. When asked, set:
   - `DB_URL` — the Atlas string from step 1;
   - `ANTHROPIC_API_KEY` — your key, or leave empty so visitors bring their own;
   - `WEB_ORIGIN` — `https://matselect-web.onrender.com`;
   - `NEXT_PUBLIC_API_URL` — `https://matselect-api.onrender.com/api`.

   If Render gives the services different URLs, update `WEB_ORIGIN` and `NEXT_PUBLIC_API_URL` to the real ones, then redeploy the web app (`NEXT_PUBLIC_*` values are baked in at build time).
4. **Check.** Open `https://<api>/api/health` (`database` should say `connected`), then the web URL.

Notes:
- Free services sleep after about 15 minutes idle; the first request then takes 30–60 s to wake them.
- Logs show in Render's dashboard (`LOG_CONSOLE=true`); the log files on Render's disk are temporary.
- To move existing results from your machine: `mongodump --uri "mongodb://127.0.0.1:27017/matselect"` then `mongorestore --uri "<Atlas string>" dump/`.

## Configuration

`api/.env` (see `api/.env.example`):

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | 4000 | API port |
| `WEB_ORIGIN` | http://localhost:3000 | Allowed CORS origin(s), comma-separated |
| `LLM_PROVIDER` | auto | `anthropic` or `mock`; auto = anthropic when a key is set |
| `ANTHROPIC_API_KEY` | — | Server Claude key. Empty → users can add their own key in the web app; no key at all → demo data |
| `LLM_MODEL` | claude-opus-5-5 | Any Claude model with structured outputs |
| `LLM_EFFORT` | medium | `low` … `max` |
| `LLM_FALLBACKS` | auto | Server-side refusal fallback (`fallbacks: "default"`) — on for models that support it |
| `MATERIALS_PER_FAMILY` | 10 | Candidates requested per family (6 families) |
| `MC_SAMPLES` | 1000 | Monte Carlo samples |
| `LLM_TIMEOUT_MS` | 120000 | Per Claude request |
| `DB_URL` | mongodb://127.0.0.1:27017/matselect | MongoDB connection |
| `RATE_LIMIT_PER_MIN` | 30 | Requests per minute per IP |
| `LOG_CONSOLE` | — | `true` keeps console logs when `NODE_ENV=prod` (needed on Render) |

`web/.env.local`: `NEXT_PUBLIC_API_URL=http://localhost:4000/api`.

## How the engine decides

All in `api/src/engine/` — pure TypeScript, no LLM calls.

1. **Plausibility** (`validate.ts`): physical bounds (density 1–25 000 kg/m³, E 1e-5–1300 GPa, strength 0.001–10 000 MPa, price 0.01–200 000 USD/kg); out-of-bounds data goes to *invalid data* and is never "fixed". Reversed ranges are reordered and flagged; ranges wider than 30× are flagged; G > E is discarded; duplicates are removed.
2. **Screening** (`pipeline.ts`): excluded families, temperature window, environment ratings (outdoor: UV and fresh water ≥ C; wet: fresh water ≥ B; marine: salt water ≥ B; chemical ≥ B; any user-typed environment ≥ B, rated per material by Claude), every required process rated good/possible, must-haves, price per kg, budget per part. Missing data → *not evaluated* (only G ≈ E/2.6 is ever estimated, and it is flagged).
3. **General parts** (brake pads, heat sinks, blades, seals…): the brief carries property requirements (e.g. friction coefficient 0.3–0.5, max temperature ≥ 400 °C), application-specific properties Claude supplies values for, and a material index to maximise (e.g. 1/wear rate). A material is ruled out only when its whole range fails a requirement; a range that straddles it passes with a flag. Each index term is scored at its conservative end.
4. **Material indices** (`physics.ts`): derived from section scaling (A ∝ sᵖᴬ, I ∝ sᵖᴵ, Z ∝ sᵖᶻ), so a free-size beam gives E^(1/2)/ρ and σ^(2/3)/ρ while a fixed-width board gives E^(1/3)/ρ and σ^(1/2)/ρ. ρ becomes ρ·C for the "cheapest" goal.
5. **Sizing** (beam, tie, column, shaft): deflection δ = FL³/(C·E·I), bending σ = M/Z ≤ σf/SF, Euler buckling F·SF ≤ π²EI/(KL)², crushing, shaft twist and von Mises shear. Takes the smallest size meeting every active constraint, records which one governs, and uses the **weak end** of each E and strength range. Wood, glass/ceramic and foam are sized as solids when a tube is chosen (they are not sold as tube).
6. **Uncertainty**: Monte Carlo with each property drawn log-uniformly and independently within its range; the seed is a hash of spec + data, so identical inputs give identical results. Reports chance of being best, chance of top 3 and the p10–p90 range.
7. **Safety**: factor 1.5 general, 2.5 carries people, 3 lifting; warnings when set lower; persistent safety notes.

Design decisions that go beyond the spec are marked `// DECISION:` in the code. The main ones:

- Claude output uses **structured outputs** (`output_config.format`) rather than a forced tool call, because current Claude models reject forced `tool_choice`. The guarantee is the same: schema-valid JSON, then zod validation, then one corrective retry.
- Columns are always checked for both buckling and crushing.
- Beams and columns needing a section more than half their length across are ruled out as impractical.
- In index mode with two criteria, the score is the weaker of the two normalised indices (% of the best).

## API

| Method | Path | |
|---|---|---|
| GET | `/api/health` | `{status, llmProvider, model, store}` |
| GET | `/api/meta` | Enumerations, default safety factors, units |
| POST | `/api/specs/extract` | `{text, audience}` → `{spec, questions[]}` |
| POST | `/api/selections` | `{spec}` → full result incl. explanation (30–90 s with Claude) |
| GET | `/api/selections` | Recent selections |
| GET | `/api/selections/:id` | One result |
| POST | `/api/selections/:id/explain` | `{audience}` → explanation (cached) |

Errors: invalid body or unit → 400 `{message, issues[{path, message}]}`; unknown id → 404; Claude failure → 502 with a readable message; rate limit → 429.

## Tests

`npm test` runs the Jest suites in `api/`:

- `engine/engine.spec.ts`: sizing cases (cantilever 44.7 mm, tie A = 80 mm² / d = 10.1 mm, column d = 25.3 mm, beam strength 18.2 mm), indices, screening (rusting steel, undrillable glass, missing E, negative density), determinism, validation, units and safety.
- `core/selection/util/grounding.spec.ts`: rounding accepted, invented numbers flagged, grades ignored.
- `api/test/selection.e2e-spec.ts` (`npm run test:e2e`, needs MongoDB): the real app over HTTP — 400/401/404/502, user key via header, demo mode end to end, a skipped Claude family, explanation caching.
- `core/llm/llm.service.spec.ts`: which key a request uses (server → user → demo).

## Known limitations

- Property data comes from Claude's knowledge (or the built-in demo set), **not a verified database**. Values can be wrong; check supplier datasheets.
- Candidate lists can vary between Claude runs (the engine is deterministic for a given candidate set).
- Simple idealisations only: one critical part, standard load cases, no FEA, joints or fatigue.
- Monte Carlo assumes independent, log-uniform property ranges.
- Results are guidance, not certified design. Anything that carries people or lifts loads needs the relevant standard and a qualified engineer.

**Upgrade path:** a verified materials table that overrides Claude's values when a name matches, and a "ask Claude twice and flag disagreement" consistency check.
