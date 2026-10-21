# REQUIREMENTS — MatSelect MVP: AI Material Selection (NestJS + Next.js)

> Build spec for a coding agent. Read fully before writing code. Build in the milestone order in §12. When something is ambiguous, choose the simplest option that meets the acceptance criteria and leave a `// DECISION:` comment.

---

## 1. Product summary

MatSelect is a web app where a **craftsman, engineer or member of the public** describes what they want to build, with its constraints and objectives. The system then:

1. turns the description into structured requirements (the user confirms or edits them),
2. asks **Claude for candidate materials across all material families and research papers**, with typical property ranges,
3. **calculates** the material performance index, checks every constraint, sizes the part, ranks the materials that fit, and lists the ones ruled out with reasons,
4. **explains** the result at the user's level: craftsman, everyday or engineer.

**MVP scope:** no plots or charts. Results are cards, tables and text.

### Division of labour (core design rule)

| Step | Done by | Why |
|---|---|---|
| Understand the description → structured requirements | Claude | language understanding |
| Propose candidate materials + typical property ranges | Claude | broad knowledge of "all materials in the world" |
| Plausibility checks on Claude's data | Code (deterministic) | catch impossible values |
| Material index, constraint screening, sizing, ranking, uncertainty | **Code (deterministic)** | must be correct, repeatable and auditable |
| Which materials fit and which don't, and why | **Code** | decided by the calculation, not by Claude's opinion |
| Explanation for the chosen audience | Claude | language, tied to the computed results |
| Check the explanation uses only computed numbers | Code | trust |

**Claude never decides the ranking.** It supplies candidates and data. The calculations decide which materials fit and in what order.

---

## 2. Architecture

```
Next.js frontend  ──REST──▶  NestJS backend  ──HTTPS──▶  Claude API (Anthropic)
 describe · confirm ·         extraction · candidate generation ·
 results · explanation         engine (indices, screening, sizing,
                               ranking, Monte Carlo) · grounding check ·
                               persistence (JSON files → DB later)
```

| Part | Tech |
|---|---|
| `api/` | NestJS 11, TypeScript (strict), `@anthropic-ai/sdk`, zod (validation of requests **and** Claude outputs), `@nestjs/throttler`, Jest |
| `web/` | Next.js 14 (App Router), TypeScript, Tailwind CSS, react-markdown |

**Rules**

- The Claude API key lives **only** in the backend.
- All engineering calculations are pure TypeScript functions in `api/src/engine/` with **no** LLM calls, and they are unit-tested.
- **Mock mode** (`LLM_PROVIDER=mock`): built-in demo extraction, demo materials and template explanations, so the whole app runs with no API key. The UI shows a "Demo / mock data" banner in this mode.

---

## 3. Repository layout

```
matselect/
├── api/
│   ├── .env.example
│   └── src/
│       ├── main.ts                    # global prefix /api, CORS
│       ├── app.module.ts              # throttler guard
│       ├── config.ts
│       ├── domain/types.ts            # zod schemas + TS types (single source of truth)
│       ├── common/zod.pipe.ts         # request validation pipe
│       ├── llm/
│       │   ├── llm.service.ts         # Claude wrapper: structured (forced tool) + text calls
│       │   ├── schemas.ts             # JSON Schemas for Claude tool inputs
│       │   ├── prompts.ts             # extraction, candidate and explanation prompts
│       │   └── mock.ts                # mock-mode data
│       ├── engine/
│       │   ├── units.ts               # unit conversion
│       │   ├── physics.ts             # indices, section scaling, sizing formulas
│       │   ├── validate.ts            # plausibility checks on AI data
│       │   ├── pipeline.ts            # runSelection(spec, materials) → result
│       │   └── engine.spec.ts
│       └── selection/
│           ├── selection.controller.ts
│           ├── selection.service.ts   # orchestrates Claude + engine
│           ├── grounding.ts (+ .spec.ts)
│           └── store.service.ts       # JSON-file persistence
└── web/
    ├── .env.example                   # NEXT_PUBLIC_API_URL
    ├── app/ layout.tsx, page.tsx (describe + confirm), results/[id]/page.tsx
    ├── components/ SpecEditor.tsx, ResultsView.tsx, ui.tsx
    └── lib/ api.ts, types.ts (mirror of backend types), labels.ts
```

---

## 4. Environment variables

```
# api/.env
PORT=4000
WEB_ORIGIN=http://localhost:3000
LLM_PROVIDER=anthropic            # anthropic | mock (if unset: anthropic when a key is present, else mock)
ANTHROPIC_API_KEY=
LLM_MODEL=claude-sonnet-4-5       # any Claude model with tool use; configurable
MATERIALS_PER_FAMILY=10           # candidates requested per family
MC_SAMPLES=1000                   # Monte Carlo samples
LLM_TIMEOUT_MS=120000
DATA_DIR=./data

# web/.env.local
NEXT_PUBLIC_API_URL=http://localhost:4000/api
```

---

## 5. Domain model (`domain/types.ts`, zod)

### 5.1 Enumerations

- **audience:** `craftsman | everyday | engineer`
- **component** (how the critical part is loaded):
  - `beam`: bends (shelves, rails, planks, arms, seats)
  - `tie`: tension
  - `column`: compression/buckling
  - `shaft`: torsion
  - `spring`
  - `hinge`: flexes without yielding
  - `insulation`: limits heat flow
  - `thermal_shock`
- **objective:** `min_mass | min_cost`
- **criteria:** `stiffness | strength` (one or both)
- **support** (beam): `simply_supported_center | simply_supported_uniform | cantilever_end`
- **endCondition** (column): `pinned_pinned | fixed_free | fixed_fixed | fixed_pinned`
- **section:** `solid_square | solid_round | round_tube | square_tube | rect_fixed_width` (planks/boards/panels)
- **environment:** `indoor | outdoor | wet | marine | chemical | food_contact`
- **processes** (user's tools): `hand_cut | power_cut | drill | machine | weld | glue | fasten | bend | cast | mould | print_3d | woodwork`
- **mustHave:** `transparent | electrical_insulator | impact_resistant`
- **families:** `metal | polymer | ceramic_glass | composite | wood_natural | foam_elastomer`
- **safetyClass:** `general | carries_people | lifting`
- **ratings:** `A` excellent … `E` unacceptable
- **process ratings:** `good | possible | difficult | no`
- **confidence:** `high | medium | low`

### 5.2 `DesignSpec`

| Field | Type / default |
|---|---|
| `title` | string |
| `audience` | enum, default `everyday` |
| `component` | enum |
| `objective` | enum, default `min_mass` |
| `criteria` | enum[], default `[stiffness, strength]` |
| `load` | `{value, unit}` or null (kg, N, kN, lb; torque N·m for shaft) |
| `length` | `{value, unit}` or null (mm, cm, m, in, ft) |
| `maxDeflection` | `{value, unit}` or null (beam deflection / tie stretch) |
| `maxTwistDeg` | number or null (shaft) |
| `support`, `endCondition`, `section` | enums, with defaults |
| `sectionWidth` | `{value, unit}` or null (for planks/panels) |
| `tubeRatio` | number, default 15 (outer size ÷ wall) |
| `environment` | enum[], default `[indoor]` |
| `tempRangeC` | `[min, max]` or null |
| `requiredProcesses` | enum[] (tools the user has) |
| `mustHave` | enum[] |
| `excludeFamilies` | enum[] |
| `maxPricePerKg` | USD/kg or null |
| `budgetPerPart` | USD or null |
| `safetyClass` | enum, default `general` |
| `safetyFactor` | number or null (null → default by class) |
| `assumptions` | string[] (every default Claude applied, shown to the user) |
| `sourceText` | the user's original description |

### 5.3 `Material` (from Claude, validated in code)

`name`, `family`, `grade?`, and **ranges `[min, max]`** for:

| Property | Unit |
|---|---|
| `density` | kg/m³ |
| `E` | GPa |
| `G` | GPa |
| `strength` | MPa: yield for metals/polymers; modulus of rupture for wood, glass, ceramics, stone, concrete |
| `Kic` | MPa·√m |
| `tMax`, `tMin` | °C |
| `lambda` | W/m·K |
| `alpha` | µstrain/K |
| `price` | USD/kg |

Plus:

- flags: `brittle`, `transparent`, `electricalInsulator`
- `ratings{fresh_water, salt_water, uv, chemicals}`
- `processes{<process>: rating}`
- `forms[]`, `confidence`, `notes`

A null property means "unknown". **Claude must use null instead of guessing.**

### 5.4 `SelectionResult`

| Field | Content |
|---|---|
| `id`, `createdAt`, `spec` | identification and the confirmed spec |
| `mode` | `sizing` (load + length given → part size, mass, cost) or `index` (rank by performance index only) |
| `objectiveLabel`, `objectiveUnit`, `lowerIsBetter` | what the ranking measures |
| `index` | `{expression, description, cost}`, e.g. `E^(1/2)/ρ` |
| `safetyFactor`, `activeConstraints[]` | what was applied |
| `ranking[]` | rank, material, `objectiveValue`, `objectiveInterval` (p10–p90), `pBest`, `pTop3`, `sizing{dimension, massKg, costUsd[min,max], governing}`, `processFit`, `reasons[]` (generated by code), `dataFlags[]` |
| `rejected[]` | materials that failed a requirement, with reasons |
| `notEvaluated[]` | missing data |
| `invalidData[]` | implausible data |
| `materials[]` | every candidate with its AI-estimated data |
| `warnings[]`, `safetyNotes[]` | notices for the user |
| `dataSource` | `llm \| mock` |
| `explanations{audience: {text, grounded, unverifiedNumbers}}` | cached per audience |
| `timingsMs` | per stage |

---

## 6. Processing pipeline

### 6.1 Extraction (Claude)

- Input: description + audience.
- Output, via a **forced tool call** whose input schema is `DesignSpec` + up to 3 `questions`: `{spec, questions[{field, question, options[{label, value}], default}]}`.
- Validate the output with zod. On failure, retry once with the validation errors in the prompt.
- Prompt rules:
  - idealise the critical part (shelf → beam with `rect_fixed_width`; leg → column; …)
  - keep the user's units
  - a person ≈ 100 kg unless stated
  - `safetyClass = carries_people` for ladders, seats, benches, stairs, platforms; `lifting` for hooks and hoists
  - tools only as stated
  - write every default into `assumptions`
  - ask only questions that change the result (load, span, allowed bending, tools, environment)
- Questions are answered **in the frontend** by writing the option value into the spec field. No second Claude call.

### 6.2 Candidate generation (Claude)

- For each family not excluded, make **one parallel Claude call** (6 calls, forced tool, `maxItems: 25`). Each call returns `MATERIALS_PER_FAMILY` (default 10) real, commercially available materials from that family, with property ranges.
- Context sent to Claude: title, description, component, criteria, objective, environment, temperature range, mustHave, the user's tools.
- Claude must include the **everyday choices a person would consider even if unsuitable**, so the engine can explain why not.
- Drop materials whose family doesn't match the request.
- If one family's call fails, skip it and add a warning. If **all** fail, return 502 with a clear message.
- This yields up to about 60 candidates per selection.

### 6.3 Plausibility validation (code, `validate.ts`)

- Physical bounds per property:

  | Property | Bounds |
  |---|---|
  | density | 1–25 000 kg/m³ |
  | E | 1e-5–1300 GPa |
  | strength | 0.001–10 000 MPa |
  | price | 0.01–200 000 USD/kg |

  Outside bounds → `invalidData` (never "fixed").
- A reversed range (min > max) is reordered and flagged.
- A very wide range (max/min > 30) is flagged as uncertain.
- G > E is discarded. `confidence: low` is flagged.
- Duplicates (same name + grade) are removed.

### 6.4 Engine (code, `pipeline.ts`, `physics.ts`)

**Safety factor:** default 1.5 general, 2.5 carries people, 3 lifting. Warn if the user sets a lower one.

**Mode:**

- `sizing` when the component is beam/tie/column/shaft **and** load + length are given (plus a deflection or twist limit for stiffness). In sizing mode, materials are ranked by **part mass** (min_mass) or **part material cost** (min_cost).
- Otherwise `index`: rank by the performance index, with a warning explaining why.

**Material indices** (higher is better; `ρ` becomes `ρ·C` for min_cost):

| Component | Stiffness | Strength |
|---|---|---|
| tie | E/ρ | σ/ρ |
| beam (free section size) | E^(1/2)/ρ | σ^(2/3)/ρ |
| beam/panel (fixed width, free thickness) | E^(1/3)/ρ | σ^(1/2)/ρ |
| column (buckling) | E^(1/2)/ρ | — |
| shaft | G^(1/2)/ρ | σ^(2/3)/ρ |
| spring | σ²/(E·ρ) | |
| hinge | σ/E | |
| insulation | 1/λ (or 1/(λ·ρ·C) for cost) | |
| thermal shock | σ/(E·α) | |

Derive the beam exponents from the section scaling (A ∝ s^pA, I ∝ s^pI, Z ∝ s^pZ) so the panel case falls out automatically.

**Screening** (each failure gives a plain-language reason):

- excluded family
- temperature window: `tMax` min ≥ required max; `tMin` max ≤ required min when below 0 °C
- environment ratings:

  | Environment | Requirement |
  |---|---|
  | outdoor | UV ≥ C and fresh water ≥ C |
  | wet | fresh water ≥ B |
  | marine | salt water ≥ B |
  | chemical | chemicals ≥ B |

- tools: every required process rated `good` or `possible`
- mustHave: transparent, electrically insulating, impact-resistant (not brittle)
- `maxPricePerKg`, and `budgetPerPart` (sizing mode)
- A missing required property → `notEvaluated` (never imputed). Exception: G ≈ E/2.6 when only E is known, which is flagged.

**Sizing** (SI units, conservative: uses the **low end** of the E and strength ranges in the nominal calculation):

| Case | Formula |
|---|---|
| tie | A = F·SF/σ; stretch: A = F·L/(E·δ) |
| beam | δ = F·L³/(C·E·I), with C = 48 (centre load), 384/5 (uniform), 3 (cantilever); strength σ = M/Z ≤ σ/SF, with M = FL/4, FL/8, FL |
| column | Euler F·SF ≤ π²·E·I/(K·L)², K = 1, 2, 0.5, 0.7; crushing A = F·SF/σ |
| shaft (solid round) | twist θ = T·L/(G·J); shear τ = 16T/(πd³) ≤ σ/(√3·SF) |

- Section shapes: solid square/round, square/round tube (fixed outer/wall ratio), plank of fixed width.
- Wood, glass/ceramic/stone and foams are sized as **solid** sections when a tube is selected (they aren't sold as tube), with a note.
- Take the smallest size meeting **all** active constraints and record which one governs. Then mass = ρ·A·L and cost = mass × price range.
- Units: kg → N (×9.81), lb, kN, N; mm, cm, m, in, ft; N·m, lbf·ft. An unknown unit → 400 error with the supported list.

**Uncertainty:** Monte Carlo, `MC_SAMPLES` draws, each property log-uniform within its range (independent; document the assumption). The seed comes from a hash of spec + data, so results are deterministic. Report `pBest`, `pTop3` and the p10–p90 interval. If the top two are within 15 points of pBest, warn that either could be the better choice.

**Reasons:** generated by code from numbers, for example:

- "Lightest part that meets every requirement: about 3.1 kg"
- "About 1.6× the mass of the top pick"
- "Size is set by the deflection limit"
- "Durability ratings: UV A, water A"
- "Works with your tools: drill (good)"

**Safety notes:** for `carries_people` and `lifting`, always show "guidance, not certified design; check the relevant standard and have a qualified engineer review". For food contact, recommend confirming a certified grade.

### 6.5 Explanation (Claude) + grounding check (code)

- Input: a compact result payload containing the design, mode, index, constraints, top 5 ranked (values, sizes, reasons, probabilities), up to 8 rejected with reasons, warnings and safety notes.
- Audience styles:
  - **Craftsman:** practical, stock form and size to buy, "Working with it" (cutting, joining, finishing), no equations.
  - **Everyday:** plain language and analogies, jargon defined.
  - **Engineer:** a "Method" section covering idealisation, constraints, safety factor, the index and why it applies, what governs the size, and how to read the probabilities.
- Hard rules in the prompt:
  - use only numbers from the payload
  - recommend rank 1, give 1–2 alternatives, and explain "why not" for 2–3 rejected materials
  - state that properties are AI-estimated ranges to verify with supplier datasheets
  - include safety notes
  - 220–420 words, Markdown `##` sections
- **Grounding check:** extract every number from the text, ignoring material names/grades and small integers ≤ 10. Each must match a payload number within 5% (also allowing ×100 for percentages and ×1000/÷1000 for unit changes).
  - If any don't match, regenerate once, listing them.
  - Store `grounded` and `unverifiedNumbers`. The UI shows "✓ Every number checked against the calculation", or a warning listing the unverified numbers.
- Explanations are generated on demand per audience and cached in the result.

---

## 7. Backend API (NestJS, prefix `/api`)

| Method | Path | Body → Response |
|---|---|---|
| GET | `/health` | → `{status, llmProvider, model}` |
| GET | `/meta` | → all enumerations + default safety factors (for forms) |
| POST | `/specs/extract` | `{text (5–2000 chars), audience}` → `{spec, questions[]}` |
| POST | `/selections` | `{spec: DesignSpec}` → `SelectionResult` (includes the explanation for `spec.audience`) |
| GET | `/selections` | → recent list `{id, createdAt, title, topPick, candidates}` |
| GET | `/selections/:id` | → `SelectionResult` |
| POST | `/selections/:id/explain` | `{audience}` → `Explanation` (cached) |

- **Validation:** zod pipe on every body. 400 with `{message, issues[{path, message}]}`.
- **Errors:** Claude failures → 502 with a readable message. Unit errors → 400. Unknown ID → 404.
- **Rate limit:** 30 requests/min per IP (protects the API budget).
- **CORS:** `WEB_ORIGIN` only.
- **Persistence:** one JSON file per selection in `DATA_DIR/selections/` (IDs validated as UUIDs). It sits behind `StoreService` so it can be swapped for a database later.
- **Expected latency:** `/selections` takes about 30–90 s with real Claude (6 parallel candidate calls + explanation). The frontend shows progress.

---

## 8. Frontend (Next.js)

### 8.1 Home `/`: describe → confirm

1. **Describe:**
   - textarea ("What do you want to build?")
   - audience toggle: Craftsman / Everyday / Engineer
   - 5 example chips (ladder, shelf, drone arm, garden bench, cool box)
   - "Continue" button, which calls `/specs/extract`
   - list of recent selections
2. **Confirm:**
   - clarifying-question cards: clicking an option writes it into the spec and marks the card answered
   - **SpecEditor** form in four sections:
     - **What it is:** name, component (plain labels such as "Beam / board that bends"), goal (light / cheap), criteria ("not bend too much", "not break"), audience
     - **Loads and size** (only for beam/tie/column/shaft): load + unit, span + unit, max bending/stretch or max twist, support or end condition, section shape, board width, tube ratio
     - **Use and making:** environment chips, tool chips, must-have chips, families to exclude, temperature range, max price/kg, budget per part
     - **Safety:** use class and safety factor (placeholder shows the default; warning if set lower)
   - the assumptions list, each with a remove button
   - sticky "Find materials →" button
3. **Running:** a progress card with staged messages (candidates → plausibility checks → screening → sizing and simulations → ranking and explanation), ~30–90 s. Navigate to the results when done. On error, return to Confirm with the message.
4. Support `/?edit=<id>`, which loads that selection's spec into Confirm ("Change requirements").

### 8.2 Results `/results/[id]`

- **Header:** title; counts ("N candidates considered · M fit · K ruled out · J not evaluated"); "Change requirements" and "New selection" buttons.
- **Banners:** mock data; **safety notes** (red, prominent); warnings.
- **"How it was ranked" card:** objective (e.g. "Lowest mass of the part (kg)") or index; index expression + description; requirements applied; safety factor ("sizes use the weakest end of each property range").
- **Top 3 pick cards** (rank 1 highlighted):
  - family, name, grade, confidence badge
  - mass or cost (or % of best index), chance it's the best
  - size needed, mass, material cost range
  - code-generated reasons
  - tool-fit badges (good / possible / difficult / no)
  - data flags
- **Explanation panel:** audience toggle (fetches and caches other audiences), grounding badge, rendered Markdown.
- **All materials that fit** (table, shown when there are more than 3): #, material, objective, likely range p10–p90, size, best / top-3 %.
- **Ruled out** list: material, family, reasons. **Not evaluated** list: missing or implausible data.
- **"Property data used"** (collapsible table): every candidate's AI-estimated ranges (density, E, strength, max temp, price, water/UV ratings, confidence, notes) plus a ratings legend.
- **Footer on every page:** "Property values are AI-estimated typical ranges and vary by grade, supplier and processing. Results are guidance, not certified design."
- **No charts or plots** in the MVP.

### 8.3 UX requirements

- Mobile-first, with a single column below 768 px. Tables scroll horizontally inside their card.
- Every error is shown in plain language, e.g. "Cannot reach the MatSelect API at … Is the backend running?"
- Buttons are disabled while busy.

---

## 9. Trust and safety requirements

1. **Claude never ranks or filters.** Fit and order come only from the engine.
2. All AI data is labelled as AI-estimated, with confidence shown per material and every property range visible in the data table.
3. Implausible or missing data is never silently fixed or imputed (the G-from-E estimate is the one flagged exception).
4. Explanations are number-grounded and verified in code.
5. Safety classes raise the safety factor and show persistent warnings.
6. The user always sees and can edit the assumptions.

---

## 10. Known limitations (state these in the README and demo)

- Property data comes from Claude's knowledge, not a verified database. Values can be wrong, and results should be checked against supplier datasheets.
- Candidate lists can vary between runs (the engine is deterministic for a given candidate set).
- Simple idealisations only: one critical part, standard load cases, no FEA, no joints or fatigue.
- Monte Carlo assumes independent, log-uniform property ranges.

**Post-MVP upgrade path:** add a verified materials table that overrides Claude's values when a name matches, and a "re-ask Claude twice and flag disagreement" consistency check.

---

## 11. Acceptance criteria

1. **Mock end-to-end:** with `LLM_PROVIDER=mock` and no API key, describe → confirm → results → switch audience works in the browser.
2. **Sizing correctness (unit tests):**

   | Case | Expected |
   |---|---|
   | steel cantilever, 1 kN, 1 m, 5 mm deflection, solid square, E = 200 GPa | side 44.7 mm |
   | steel tie, 10 kN, SF 2, σ = 250 MPa | A = 80 mm², d = 10.1 mm |
   | pinned steel column, 2 m, 10 kN, solid round | d = 25.3 mm |
   | simply supported beam strength, 1 kN, 1 m, solid square | side 18.2 mm |

3. **Indices (unit tests):** square tube stiffness → `E^(1/2)/ρ`; plank stiffness → `E^(1/3)/ρ`; solid round strength → `σ^(2/3)/ρ`; tie stiffness at min cost → `E/ρ·C`.
4. **Screening (unit test):** an outdoor + drill-only case rejects a rusting steel (water rating D) and a material that can't be drilled, sends a material with missing E to "not evaluated" and one with negative density to "invalid data", and ranks the rest. Two identical runs give identical rankings.
5. **Grounding (unit tests):** accepts payload numbers with rounding; flags invented numbers (e.g. "2700 kg/m³" not in the payload); ignores grades like "6061-T6".
6. **Real Claude run:** the ladder example returns ≥ 30 candidates from ≥ 5 families, at least 1 fitting material, the safety note, and a grounded explanation, within 120 s.
7. **Robustness:** invalid request body → 400 with issues; Claude failure in one family → that family is skipped with a warning; failure in all families → 502.

---

## 12. Milestones (2-day hackathon)

| # | Milestone | Done when |
|---|---|---|
| M0 | Scaffold `api/` (NestJS) and `web/` (Next.js + Tailwind); `domain/types.ts` | both start; `/api/health` responds |
| M1 | Engine: units, indices, sizing, validation, screening, Monte Carlo, reasons + Jest tests | acceptance #2–#4 pass |
| M2 | Mock mode + endpoints + JSON store | acceptance #1 via curl |
| M3 | Frontend: describe, confirm (SpecEditor, questions), progress, results, explanation panel | acceptance #1 in the browser |
| M4 | Claude integration: extraction, parallel candidate generation, explanation + grounding | acceptance #5–#6 |
| M5 | Error handling, rate limit, edit flow, mobile pass, README | acceptance #7; demo ready |

**Suggested split for 3–4 people:** Engine + tests (M1); NestJS API + Claude integration (M2, M4); Frontend (M3); prompts, test cases and demo script (shared).

### Demo script (4 minutes)

1. Ask ChatGPT or Claude directly for ladder materials. You get an opinion: no sizing, no systematic screening, different answers each time.
2. In MatSelect, type the ladder example. It asks one question, shows the assumptions, and shows the safety class "carries people".
3. Results: about 60 candidates considered. Top pick with tube size, mass and cost. "Why not steel?" (rusts outdoors). "Why not stainless?" (hard to cut with your tools).
4. Switch the audience to Engineer: the same result now shows the index, governing constraint and probabilities. Point out the "✓ every number checked" badge.
5. "Change requirements" → "I have a welder" → the ranking updates.

(The numbers in this script are illustrative. Use whatever the real run produces.)
