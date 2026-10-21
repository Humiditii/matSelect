'use client';

import { useState } from 'react';

type Actor = 'you' | 'ai' | 'code';

interface Step {
  id: string;
  label: string;
  actor: Actor;
  kind?: 'box' | 'decision' | 'end';
  /** Box position in the SVG (viewBox units). */
  x: number;
  y: number;
  w?: number;
  details: {
    title: string;
    body: string;
    where: string;
    readMore?: string;
  };
}

const ACTOR_STYLE: Record<Actor, { stroke: string; fill: string; name: string }> = {
  you: { stroke: '#0f9488', fill: '#e8f6f4', name: 'You' },
  ai: { stroke: '#e07b00', fill: '#fff4e5', name: 'AI (LLM)' },
  code: { stroke: '#1d5ef1', fill: '#eef4ff', name: 'Calculation (code)' },
};

const MAIN_X = 130;
const MAIN_W = 220;
const SIDE_X = 336;

const STEPS: Step[] = [
  {
    id: 'describe',
    label: 'You describe the part',
    actor: 'you',
    kind: 'end',
    x: MAIN_X,
    y: 30,
    details: {
      title: 'It starts with a sentence',
      body: 'You type what you want to make, in your own words: "a shelf for my books, 90 cm long" or "a brake pad for a go-kart". No forms, no engineering vocabulary needed. The web app sends the text to the API.',
      where: 'web/app/page.tsx → POST /api/specs/extract',
      readMore: '#brief',
    },
  },
  {
    id: 'extract',
    label: 'Turn words into a brief',
    actor: 'ai',
    x: MAIN_X,
    y: 100,
    details: {
      title: 'The LLM reads it like an engineer would',
      body: "The LLM follows Ashby's method: what does the part do (function), what must it never do (constraints), and what should be as small as possible (objective)? It fills in a structured brief and writes down every assumption it made. With no API key, simple keyword rules do the same job for common parts.",
      where: 'api/src/core/spec/spec.service.ts, prompts in core/llm/prompts/llm.prompts.ts',
      readMore: '#brief',
    },
  },
  {
    id: 'check',
    label: 'You check the brief',
    actor: 'you',
    x: MAIN_X,
    y: 170,
    details: {
      title: 'You stay in charge of the requirements',
      body: 'The brief is shown back to you: the goal, the loads and sizes, the environment and every assumption. You can remove anything that is wrong, add a sentence ("it lives outdoors"), or open the full form. Nothing is calculated until you press "Find materials".',
      where: 'web/components/BriefEditor.tsx',
      readMore: '#brief',
    },
  },
  {
    id: 'candidates',
    label: 'Gather candidate materials',
    actor: 'ai',
    x: MAIN_X,
    y: 240,
    details: {
      title: 'About 60 candidates from every family',
      body: 'Six requests run at the same time, one per material family (metals, plastics, ceramics and glass, composites, wood and natural, foams and rubbers). Each asks for 10 real, buyable materials with property ranges, not single numbers, plus durability ratings and references. Without a key, a built-in set of 67 materials is used.',
      where: 'api/src/core/material/material.service.ts',
      readMore: '#candidates',
    },
  },
  {
    id: 'validate',
    label: 'Is the data believable?',
    actor: 'code',
    kind: 'decision',
    x: MAIN_X,
    y: 318,
    details: {
      title: 'Never trust data blindly',
      body: 'Every number is checked against physical limits (no density above 25 000 kg/m³, no stiffness above diamond). Reversed ranges are fixed, very wide ranges are flagged, duplicates are removed. Anything impossible goes to "invalid data" and is set aside, never patched up.',
      where: 'api/src/engine/validate.ts',
      readMore: '#candidates',
    },
  },
  {
    id: 'screen',
    label: 'Meets every requirement?',
    actor: 'code',
    kind: 'decision',
    x: MAIN_X,
    y: 408,
    details: {
      title: 'Screening: pass or fail',
      body: 'Each material is checked against the hard requirements: the environment (does it rust or rot?), temperature, your tools, must-haves like "electrical insulator", and any property limits. Fail one and it is ruled out with the exact reason. If the data needed to judge is missing, it goes to "not evaluated" instead of being guessed.',
      where: 'api/src/engine/screening.ts',
      readMore: '#screening',
    },
  },
  {
    id: 'size',
    label: 'Size the part or score the index',
    actor: 'code',
    x: MAIN_X,
    y: 488,
    details: {
      title: 'The physics',
      body: 'If you gave a load and a length, the engine works out how thick the part must be in each material so it neither bends too much nor breaks, then its mass, cost and carbon. Otherwise it scores each material with a material index: the combination of properties that measures "best" for this job.',
      where: 'api/src/engine/sizing.ts, section.ts, indices.ts, evaluation.ts',
      readMore: '#physics',
    },
  },
  {
    id: 'rank',
    label: 'Rank by your goal',
    actor: 'code',
    x: MAIN_X,
    y: 558,
    details: {
      title: 'Lightest, cheapest, lowest carbon, or balanced',
      body: 'The survivors are sorted by the goal. "Balanced" uses a penalty function that puts mass, cost and carbon on the same dollar scale, so several goals can be traded off honestly.',
      where: 'api/src/engine/pipeline.ts, evaluation.ts',
      readMore: '#goals',
    },
  },
  {
    id: 'montecarlo',
    label: 'Test it 1000 times',
    actor: 'code',
    x: MAIN_X,
    y: 628,
    details: {
      title: 'How sure are we?',
      body: 'Real material properties vary. The engine redoes the whole ranking 1000 times with every property drawn at random from its range. Counting how often each material comes first gives "chance it is the best", and the spread of results gives the likely range shown on the charts.',
      where: 'api/src/engine/monteCarlo.ts, random.ts',
      readMore: '#uncertainty',
    },
  },
  {
    id: 'explain',
    label: 'Explain, then check every number',
    actor: 'ai',
    x: MAIN_X,
    y: 698,
    details: {
      title: 'Plain words, verified',
      body: 'The LLM writes the explanation for your chosen audience (craftsman, everyday or engineer) from the calculated results only. Code then extracts every number in the text and checks it against the calculation. If any number cannot be traced back, the text is regenerated once and flagged if still unsure.',
      where: 'api/src/core/explanation/explanation.service.ts, selection/util/grounding.util.ts',
      readMore: '#explain',
    },
  },
  {
    id: 'results',
    label: 'Results, charts and suppliers',
    actor: 'you',
    kind: 'end',
    x: MAIN_X,
    y: 768,
    details: {
      title: 'What you see',
      body: 'The result is saved in MongoDB and shown as top picks, the two charts, a full table, and every material that was ruled out with its reason. "Where to buy" can then search for suppliers in your country.',
      where: 'web/components/ResultsView.tsx, components/charts/, core/sourcing/',
      readMore: '#charts',
    },
  },
  {
    id: 'invalid',
    label: 'Invalid data',
    actor: 'code',
    x: SIDE_X,
    y: 318,
    w: 108,
    details: {
      title: 'Set aside, not fixed',
      body: 'Materials with impossible numbers are listed under "Not evaluated" on the results page, with what was wrong. We would rather miss a material than rank one on made-up data.',
      where: 'api/src/engine/validate.ts',
    },
  },
  {
    id: 'ruledout',
    label: 'Ruled out / Not evaluated',
    actor: 'code',
    x: SIDE_X,
    y: 408,
    w: 108,
    details: {
      title: 'Every "no" comes with a reason',
      body: 'Ruled-out materials are listed with the exact failed check, for example "Maximum service temperature about 80–100 °C; it must reliably handle 150 °C". That list is often as useful as the winners.',
      where: 'api/src/engine/screening.ts',
    },
  },
];

const ARROWS: { from: string; to: string; label?: string }[] = [
  { from: 'describe', to: 'extract' },
  { from: 'extract', to: 'check' },
  { from: 'check', to: 'candidates' },
  { from: 'candidates', to: 'validate' },
  { from: 'validate', to: 'screen', label: 'yes' },
  { from: 'screen', to: 'size', label: 'yes' },
  { from: 'size', to: 'rank' },
  { from: 'rank', to: 'montecarlo' },
  { from: 'montecarlo', to: 'explain' },
  { from: 'explain', to: 'results' },
];

const BOX_H = 40;
const DIAMOND_H = 56;

function heightOf(step: Step) {
  return step.kind === 'decision' ? DIAMOND_H : BOX_H;
}

function NodeShape({ step, selected }: { step: Step; selected: boolean }) {
  const style = ACTOR_STYLE[step.actor];
  const w = step.w ?? MAIN_W;
  const h = heightOf(step);
  const common = { fill: style.fill, stroke: style.stroke, strokeWidth: selected ? 3 : 1.5 };
  if (step.kind === 'decision')
    return (
      <polygon
        points={`${step.x},${step.y - h / 2} ${step.x + w / 2},${step.y} ${step.x},${step.y + h / 2} ${step.x - w / 2},${step.y}`}
        {...common}
      />
    );
  return <rect x={step.x - w / 2} y={step.y - h / 2} width={w} height={h} rx={step.kind === 'end' ? h / 2 : 8} {...common} />;
}

/** The whole request, step by step. Click a box to read what happens there. */
export function Flowchart() {
  const [selectedId, setSelectedId] = useState('describe');
  const selected = STEPS.find((s) => s.id === selectedId)!;
  const byId = Object.fromEntries(STEPS.map((s) => [s.id, s]));

  const choose = (id: string) => {
    setSelectedId(id);
    if (window.innerWidth < 1024) document.getElementById('flow-details')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  return (
    <div className="not-prose my-6">
      <div className="mb-3 flex flex-wrap gap-3 text-xs text-slate-600">
        {(Object.keys(ACTOR_STYLE) as Actor[]).map((actor) => (
          <span key={actor} className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-5 rounded" style={{ background: ACTOR_STYLE[actor].fill, border: `2px solid ${ACTOR_STYLE[actor].stroke}` }} />
            {ACTOR_STYLE[actor].name}
          </span>
        ))}
        <span className="text-slate-500">· click any box</span>
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,440px)_1fr]">
        <svg viewBox="0 0 400 800" className="w-full max-w-[440px]" role="group" aria-label="Flowchart of a selection request">
          <defs>
            <marker id="flow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="#64748b" />
            </marker>
          </defs>
          {ARROWS.map(({ from, to, label }) => {
            const a = byId[from];
            const b = byId[to];
            const y1 = a.y + heightOf(a) / 2;
            const y2 = b.y - heightOf(b) / 2 - 2;
            return (
              <g key={`${from}-${to}`}>
                <line x1={a.x} y1={y1} x2={b.x} y2={y2} stroke="#64748b" strokeWidth={1.5} markerEnd="url(#flow-arrow)" />
                {label && (
                  <text x={a.x + 8} y={(y1 + y2) / 2 + 4} fontSize={11} fill="#475569">
                    {label}
                  </text>
                )}
              </g>
            );
          })}
          {/* "no" branches from the two decisions */}
          {['validate', 'screen'].map((id, i) => {
            const decision = byId[id];
            const side = byId[i === 0 ? 'invalid' : 'ruledout'];
            const x1 = decision.x + MAIN_W / 2;
            const x2 = side.x - (side.w ?? 0) / 2 - 2;
            return (
              <g key={id}>
                <line x1={x1} y1={decision.y} x2={x2} y2={side.y} stroke="#64748b" strokeWidth={1.5} markerEnd="url(#flow-arrow)" />
                <text x={(x1 + x2) / 2} y={decision.y - 6} textAnchor="middle" fontSize={11} fill="#475569">
                  no
                </text>
              </g>
            );
          })}
          {/* The loop back: you can change the brief from the results page */}
          <path d="M 22 768 C 0 768, 0 170, 22 170" fill="none" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 4" markerEnd="url(#flow-arrow)" />
          <text transform="translate(12 470) rotate(-90)" textAnchor="middle" fontSize={10} fill="#64748b">
            change requirements
          </text>

          {STEPS.map((step) => {
            const isSelected = step.id === selectedId;
            const w = step.w ?? MAIN_W;
            const words = step.label.split(' ');
            // Side boxes are narrow, so their labels wrap onto two lines.
            const lines = w < MAIN_W && step.label.length > 14 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : [step.label];
            return (
              <g
                key={step.id}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                aria-label={step.label}
                className="cursor-pointer outline-none"
                onClick={() => choose(step.id)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), choose(step.id))}
              >
                <NodeShape step={step} selected={isSelected} />
                {lines.map((line, i) => (
                  <text
                    key={line}
                    x={step.x}
                    y={step.y + 4 + (i - (lines.length - 1) / 2) * 13}
                    textAnchor="middle"
                    fontSize={step.kind === 'decision' ? 12 : 13}
                    fontWeight={isSelected ? 700 : 500}
                    fill="#0f172a"
                  >
                    {line}
                  </text>
                ))}
              </g>
            );
          })}
        </svg>

        <div id="flow-details" className="scroll-mt-24 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl p-5 ring-2" style={{ background: ACTOR_STYLE[selected.actor].fill, ['--tw-ring-color' as string]: ACTOR_STYLE[selected.actor].stroke }}>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{ACTOR_STYLE[selected.actor].name}</p>
            <h3 className="mt-1 text-lg font-bold text-slate-900">{selected.details.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-700">{selected.details.body}</p>
            <p className="mt-3 text-xs text-slate-500">
              In the code: <code className="rounded bg-white/70 px-1 py-0.5 text-[11px] text-slate-700">{selected.details.where}</code>
            </p>
            {selected.details.readMore && (
              <a href={selected.details.readMore} className="mt-3 inline-block text-sm font-semibold text-brand-700 hover:underline">
                Read the full story ↓
              </a>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {STEPS.map((step, i) => (
              <button
                key={step.id}
                onClick={() => setSelectedId(step.id)}
                aria-label={step.label}
                className={`h-2.5 w-2.5 rounded-full ${step.id === selectedId ? 'bg-brand-600' : 'bg-slate-300 hover:bg-slate-400'}`}
                title={`${i + 1}. ${step.label}`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
