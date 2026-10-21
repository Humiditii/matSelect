import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { OpenKeyDialogButton } from './OpenKeyDialogButton';

export const metadata: Metadata = {
  title: 'How to use MatSelect',
  description: 'A step-by-step guide: describe your part, check the brief, read the results and use your own Claude API key.',
};

const SECTIONS = [
  { id: 'overview', title: 'What MatSelect does' },
  { id: 'quick-start', title: 'Quick start' },
  { id: 'describe', title: '1 · Describe your part' },
  { id: 'brief', title: '2 · Check the brief' },
  { id: 'results', title: '3 · Read the results' },
  { id: 'eco', title: 'Footprint, sustainability and where to buy' },
  { id: 'api-key', title: 'Using your own API key' },
  { id: 'examples', title: 'Worked examples' },
  { id: 'ideas', title: 'Key ideas, explained' },
  { id: 'faq', title: 'Questions & troubleshooting' },
  { id: 'limits', title: 'What it can’t do' },
];

const tryIt = (text: string) => `/?q=${encodeURIComponent(text)}`;

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <h2 className="mb-4 text-xl font-bold tracking-tight text-slate-900">{title}</h2>
      <div className="prose prose-slate max-w-none prose-h3:mb-2 prose-h3:mt-6 prose-h3:text-base prose-p:my-2 prose-li:my-0.5">{children}</div>
    </section>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="not-prose flex gap-3 rounded-xl bg-slate-50 p-4">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-600 text-sm font-bold text-white">{n}</span>
      <div className="text-sm text-slate-700">
        <p className="font-semibold text-slate-900">{title}</p>
        <div className="mt-1 space-y-1">{children}</div>
      </div>
    </div>
  );
}

function Callout({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <div className="not-prose my-3 flex gap-3 rounded-xl bg-brand-50/70 p-3 text-sm text-slate-700 ring-1 ring-inset ring-brand-100">
      <span aria-hidden>{icon}</span>
      <div>{children}</div>
    </div>
  );
}

function TryIt({ text, label = 'Try it' }: { text: string; label?: string }) {
  return (
    <Link
      href={tryIt(text)}
      className="not-prose inline-flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white no-underline hover:bg-brand-700"
    >
      {label} →
    </Link>
  );
}

function Faq({ q, children }: { q: string; children: ReactNode }) {
  return (
    <details className="not-prose group rounded-xl border border-slate-200 p-3 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer select-none items-center justify-between gap-3 text-sm font-semibold text-slate-900">
        {q}
        <span aria-hidden className="text-slate-400 transition group-open:rotate-180">⌄</span>
      </summary>
      <div className="mt-2 space-y-2 text-sm text-slate-700">{children}</div>
    </details>
  );
}

export default function TutorialPage() {
  return (
    <div className="lg:grid lg:grid-cols-[220px_1fr] lg:gap-8">
      {/* Table of contents */}
      <aside className="mb-6 lg:mb-0">
        <nav className="lg:sticky lg:top-20">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">On this page</p>
          <ol className="flex gap-2 overflow-x-auto pb-2 text-sm lg:flex-col lg:gap-1 lg:overflow-visible">
            {SECTIONS.map((s) => (
              <li key={s.id} className="shrink-0">
                <a href={`#${s.id}`} className="block whitespace-nowrap rounded-lg px-2 py-1 text-slate-600 hover:bg-white hover:text-slate-900 lg:whitespace-normal">
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
          <Link href="/" className="mt-4 hidden rounded-xl bg-brand-600 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-brand-700 lg:block">
            Start a selection →
          </Link>
        </nav>
      </aside>

      <div className="min-w-0 space-y-6">
        <header>
          <p className="text-sm font-medium text-brand-700">Tutorial</p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">How to use MatSelect</h1>
          <p className="mt-2 max-w-2xl text-slate-600">
            Everything you need to go from “I want to build…” to a confident material choice — what to type, how to check what MatSelect understood, and how to read every part of the results.
          </p>
        </header>

        <Section id="overview" title="What MatSelect does">
          <p>
            You tell MatSelect what you want to make. It works out what the material has to do, looks at candidates from <strong>every family</strong> — metals, plastics, ceramics &amp; glass, composites, wood &amp; natural materials, foams &amp; rubbers — and then{' '}
            <strong>calculates</strong> which ones fit and which is best, explaining why the others don’t.
          </p>
          <div className="not-prose my-4 grid gap-3 sm:grid-cols-3">
            {[
              ['✍️', 'You describe', 'A sentence or two in your own words.'],
              ['🧭', 'It builds a brief', 'Goal and requirements you can check and adjust.'],
              ['🏆', 'It calculates', 'Ranked materials, sizes and plain-language reasons.'],
            ].map(([i, t, d]) => (
              <div key={t} className="rounded-xl bg-slate-50 p-4 text-sm">
                <div className="text-2xl">{i}</div>
                <p className="mt-1 font-semibold text-slate-900">{t}</p>
                <p className="text-slate-600">{d}</p>
              </div>
            ))}
          </div>
          <Callout icon="🧠">
            <strong>Who decides?</strong> An AI (Claude) reads your description, suggests candidate materials with typical property values, and writes the explanation. But the <strong>ranking is never the AI’s opinion</strong>: every “fits / doesn’t fit” and every position in the list comes from engineering calculations, and every number in the explanation is checked against those calculations.
          </Callout>
        </Section>

        <Section id="quick-start" title="Quick start">
          <div className="not-prose space-y-3">
            <Step n={1} title="Describe it">
              <p>
                On the <Link href="/" className="text-brand-700 underline">home page</Link>, type what you want to build — or click an example chip — and choose who the explanation is for. Press <kbd>Continue</kbd> (or Ctrl/⌘ + Enter).
              </p>
            </Step>
            <Step n={2} title="Check the brief">
              <p>Remove anything that’s wrong, add anything missing in plain words (“it must survive 600 °C”), then press <kbd>Find materials →</kbd>.</p>
            </Step>
            <Step n={3} title="Read the results">
              <p>Look at the top picks, read the explanation, and check why your “obvious” choice was ruled out. Done in seconds with demo data, about a minute with Claude.</p>
            </Step>
          </div>
          <p className="mt-4">
            <TryIt text="I want to design a brake pad for my motorbike." label="Try a brake pad" />{' '}
            <TryIt text="A bookshelf board 90 cm long and 25 cm deep, holding about 30 kg of books, screwed to wall brackets at each end. I have woodworking tools and a drill." label="Try a bookshelf" />
          </p>
        </Section>

        <Section id="describe" title="1 · Describe your part">
          <p>Write the way you’d explain it to a friend who knows materials. The more of these you include, the fewer assumptions MatSelect has to make:</p>
          <ul>
            <li>
              <strong>What it is and what it does</strong> — “a brake pad”, “a shelf for heavy books”, “a heat sink for an LED lamp”.
            </li>
            <li>
              <strong>Sizes and loads</strong>, if it carries weight — “1.2 m long”, “holds 2 adults”, “25 cm deep”. Any common unit works: mm, cm, m, in, ft, kg, N, kN, lb.
            </li>
            <li>
              <strong>Where it’s used</strong> — outdoors, in the rain, near the sea, in a kitchen, near a pool…
            </li>
            <li>
              <strong>What matters most</strong> — as light as possible, as cheap as possible, long life, survives heat.
            </li>
            <li>
              <strong>Tools</strong> you’ll use, if you’re making it yourself — “I only have a hand saw and a drill”. Leave this out if you’ll buy it made.
            </li>
          </ul>
          <div className="not-prose my-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-rose-50 p-4 text-sm ring-1 ring-inset ring-rose-100">
              <p className="font-semibold text-rose-800">Too vague</p>
              <p className="mt-1 italic text-slate-700">“A table.”</p>
              <p className="mt-1 text-slate-600">MatSelect will have to guess the size, load and use — you’ll see lots of assumptions.</p>
            </div>
            <div className="rounded-xl bg-emerald-50 p-4 text-sm ring-1 ring-inset ring-emerald-100">
              <p className="font-semibold text-emerald-800">Good</p>
              <p className="mt-1 italic text-slate-700">“A garden table top 1.2 m long, 70 cm deep, for 4 people’s plates and drinks, left outside all year. Cheap please; I have a saw and a drill.”</p>
            </div>
          </div>
          <h3>Who is the explanation for?</h3>
          <ul>
            <li>
              <strong>🔨 Craftsman</strong> — practical: what stock to buy and how to cut, join and finish it.
            </li>
            <li>
              <strong>💬 Everyday</strong> — plain language and analogies, no jargon.
            </li>
            <li>
              <strong>📐 Engineer</strong> — the method: idealisation, constraints, the material index and how to read the probabilities.
            </li>
          </ul>
          <p>You can switch between them later on the results page.</p>
        </Section>

        <Section id="brief" title="2 · Check the brief">
          <p>MatSelect turns your words into a short brief. You don’t fill in a form — you just correct it.</p>
          <h3>The parts of the brief</h3>
          <ul>
            <li>
              <strong>Name and “what it does”</strong> — click the name to rename it.
            </li>
            <li>
              <strong>Goal</strong> — <em>Best performance / Best value for money</em> for most parts, or <em>As light / As cheap as possible</em> for load-bearing parts. “Value” divides the score by the price per kg.
            </li>
            <li>
              <strong>Ranked by</strong> — what “best” means for this part, e.g. “longest life: least material worn away”.
            </li>
            <li>
              <strong>Must</strong> — hard requirements. Each row has a minimum and/or maximum you can edit, e.g. friction coefficient 0.3 to 0.5. Press ✕ to remove one. Pills underneath cover temperature, “won’t shatter”, tools and safety.
            </li>
            <li>
              <strong>Where it’s used</strong> — tap the conditions that apply. If yours isn’t listed, type it in the box (“next to a chlorinated pool”): with Claude, every material is rated for it.
            </li>
            <li>
              <strong>Size it (optional)</strong> — only for parts that carry a load (shelves, beams, legs, rods, shafts). Add the load and span to get the actual part size, its mass and its cost.
            </li>
          </ul>
          <h3>Anything else?</h3>
          <p>Type a missing requirement in your own words and press <kbd>Update</kbd> — the brief is rebuilt from your description plus the new sentence. Examples:</p>
          <ul>
            <li>“it must survive 600 °C”</li>
            <li>“it has to be see-through and not shatter”</li>
            <li>“I only have a drill”</li>
            <li>“under $20” (budget for the part) or “under $5 per kg” (material price)</li>
          </ul>
          <h3>Quick questions, assumptions and details</h3>
          <ul>
            <li>
              <strong>Quick questions</strong> appear only when the answer changes the result (usually the load or span of a structural part). They’re optional — a sensible default is used.
            </li>
            <li>
              <strong>“We assumed …”</strong> lists every default MatSelect applied. Open it and remove any that are wrong.
            </li>
            <li>
              <strong>“Fine-tune every detail”</strong> opens the full set of options (supports, section shape, safety factor, families to exclude…). You rarely need it.
            </li>
          </ul>
          <Callout icon="💡">Fewer requirements usually means better answers. Only keep the ones that would make a material genuinely unusable.</Callout>
        </Section>

        <Section id="results" title="3 · Read the results">
          <h3>Header and banners</h3>
          <ul>
            <li>
              <strong>Counts</strong> — how many candidates were considered, how many fit, how many were ruled out and how many couldn’t be evaluated.
            </li>
            <li>
              <strong>🦺 Safety</strong> (red) — for parts that carry people or lift loads: the result is guidance, not certified design.
            </li>
            <li>
              <strong>⚠️ Notes</strong> — e.g. two materials are a close call, or a requirement couldn’t be checked.
            </li>
            <li>
              <strong>🧪 Demo data</strong> — shown when no Claude key was available.
            </li>
          </ul>
          <h3>How it was ranked</h3>
          <p>
            Shows what was optimised, the <strong>material index</strong> (the formula that measures “best” — see <a href="#ideas">Key ideas</a>) and every requirement that was applied. Check this first: if a requirement looks wrong, press <kbd>✏️ Change requirements</kbd>.
          </p>
          <h3>The top-pick cards</h3>
          <ul>
            <li>
              <strong>Family and confidence</strong> — how sure the AI is about that material’s data.
            </li>
            <li>
              <strong>Part mass / material cost</strong> (sized parts) or <strong>index score</strong> (% of the best candidate).
            </li>
            <li>
              <strong>“likely …–…”</strong> — the range you’d expect across real grades and suppliers (10th–90th percentile).
            </li>
            <li>
              <strong>Chance it’s the best / in top 3</strong> — from 1,000 “what if” runs. A clear winner shows a high chance; two similar percentages mean either is a good choice.
            </li>
            <li>
              <strong>Size, mass, cost</strong> — the part you’d actually need (sized parts only).
            </li>
            <li>
              <strong>✓ Reasons</strong> — written from the numbers, not by the AI.
            </li>
            <li>
              <strong>Tool badges</strong> — how well it works with your tools (good / possible / difficult / no).
            </li>
            <li>
              <strong>⚠️ Flags</strong> — e.g. “only part of its friction range meets the requirement — choose the grade carefully”.
            </li>
            <li>
              <strong>📚 References</strong> — sources the AI recalled for the values. Check them before relying on them.
            </li>
          </ul>
          <h3>The explanation</h3>
          <p>
            Written for the audience you picked — switch audiences at the top of the panel. The badge <strong>✓ Every number checked against the calculation</strong> means every number in the text was found in the results. If a number couldn’t be verified it is listed, and you should trust the cards and tables instead.
          </p>
          <h3>Below the explanation</h3>
          <ul>
            <li>
              <strong>All materials that fit</strong> — the full ranking.
            </li>
            <li>
              <strong>Ruled out</strong> — every material that failed, with the exact reason (“max service temperature about 250–350 °C; needs at least 400 °C”). Use the search box to find a specific material.
            </li>
            <li>
              <strong>Not evaluated</strong> — materials whose data was missing or physically impossible. MatSelect never guesses missing data.
            </li>
            <li>
              <strong>Property data used</strong> — every candidate’s property ranges, with a filter by family. ✅ marks the ones that fit.
            </li>
          </ul>
        </Section>

        <Section id="eco" title="Footprint, sustainability and where to buy">
          <h3>Lowest carbon</h3>
          <p>
            Choose <strong>🌱 Lowest carbon</strong> as the goal (or say “eco-friendly” in your description). For parts with a size, materials are ranked by the carbon needed to make <em>your part</em>: its mass × the material’s carbon footprint per kg. A heavier material with a small footprint per kg can beat a light one with a big footprint.
          </p>
          <h3>Balanced — when several things matter</h3>
          <p>
            Lightest, cheapest and lowest-carbon usually pick different materials. Choose <strong>⚖️ Balanced</strong> (or say “light but cheap”) and MatSelect uses Ashby’s <strong>penalty function</strong>: every option gets one number, <em>Z = material cost + (value of each kg saved) × mass + (carbon price) × CO₂</em>, and the lowest Z wins.
          </p>
          <p>
            The two “exchange constants” say what weight and carbon are worth to you. A kilogram saved is worth about $1 on furniture, $10 on a bicycle, $10–20 on a car and $100 or more on a drone or aircraft; a carbon price of $100 per tonne is a common middle value. Pick a preset or type your own — the card shows how Z splits into material, mass and carbon.
          </p>
          <h3>Charts</h3>
          <p>
            <strong>Compare visually</strong> on the results page has two views. <strong>📊 Ranking</strong> shows every material’s score as a bar, with a thin line for the likely range from the Monte Carlo runs: overlapping lines mean the order could swap. <strong>⚖️ Trade-off</strong> plots mass against cost (or carbon) on log scales; the blue dots are the <em>trade-off front</em> — materials no other one beats on both — and, for the balanced goal, dashed lines join designs of equal penalty. Hover or tap a dot for its numbers, or switch to <strong>Table</strong>.
          </p>
          <h3>On every card</h3>
          <ul>
            <li>
              <strong>🌱 Footprint</strong> — kg CO₂e and MJ of energy to make the part (or per kg when the part isn’t sized). These are typical cradle-to-gate values for new (virgin) material; recycled material is often much lower.
            </li>
            <li>
              <strong>♻️ Recycling</strong> — good, possible, difficult or no, with today’s recycling infrastructure. <strong>🌿 Renewable</strong> and <strong>biodegradable</strong> show when they apply.
            </li>
            <li>
              <strong>⚠ Critical</strong> — the material contains a raw material on the EU critical raw materials list (supply risk). This is checked against the official list, not guessed.
            </li>
            <li>
              <strong>🛠️ How to make it</strong> — easy / moderate / hard to work, the processes it’s good for, practical tips and safety notes.
            </li>
          </ul>
          <p>
            To insist on it, add <em>Recyclable</em> or <em>From a renewable source</em> under “Must be…” in the brief’s details, or type it in <kbd>Anything else?</kbd>.
          </p>
          <h3>Where to buy</h3>
          <p>
            Pick your country (and optionally your city) in the brief or in the <strong>Where to buy</strong> panel on the results page, and press <kbd>Find suppliers</kbd>. With Claude, a live web search finds suppliers, stockists and markets for the top three picks, with links. When no supplier names the exact grade, it lists general stockists of that kind of material and says so. Without a key you get availability guidance and ready-made search links. Only the country and city are sent.
          </p>
          <TryIt text="A bookshelf board 90 cm long and 25 cm deep for about 30 kg of books, screwed to wall brackets. I live in Lagos, Nigeria and want it to be eco-friendly." label="Try an eco-friendly shelf in Lagos" />
        </Section>

        <Section id="api-key" title="Using your own Claude API key">
          <p>MatSelect works in two modes:</p>
          <ul>
            <li>
              <strong>Demo mode</strong> (no key) — a built-in list of about 70 curated materials, simple rules to read your description, and template explanations. Good for learning the app; the calculations are still real.
            </li>
            <li>
              <strong>Claude mode</strong> — Claude reads any description, proposes ~60 candidates specific to your part (including materials from the research literature), supplies application-specific data such as friction or wear rate, and writes the explanations.
            </li>
          </ul>
          <p>
            If the server already has a key, the badge in the top-right says <strong>● Claude connected</strong> and you don’t need one. Otherwise it says <strong>● Demo data · Add API key</strong>.
          </p>
          <h3>Add your key</h3>
          <div className="not-prose space-y-3">
            <Step n={1} title="Get a key">
              <p>
                Sign in at{' '}
                <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" className="text-brand-700 underline">
                  console.anthropic.com
                </a>
                , add a payment method under <em>Billing</em>, then <em>API Keys → Create Key</em>. Copy it — it starts with <code>sk-ant-</code> and is shown only once.
              </p>
            </Step>
            <Step n={2} title="Open the key settings">
              <p>
                Click the badge in the top-right corner, or: <OpenKeyDialogButton />
              </p>
            </Step>
            <Step n={3} title="Paste, check and save">
              <p>
                Paste the key and press <kbd>Check &amp; save</kbd>. MatSelect checks it with a free call (no tokens used). Tick <em>Remember on this device</em> to keep it after you close the tab.
              </p>
            </Step>
          </div>
          <Callout icon="🔒">
            Your key stays in your browser. It is sent to the MatSelect server only with requests that need Claude, used for that request, and never saved or logged. Remove it any time from the same dialog. Usage is billed to your Anthropic account — one full selection is about 7 Claude calls.
          </Callout>
          <p>If your key is rejected (expired, revoked or out of credit), MatSelect tells you and opens the key settings so you can replace it.</p>
        </Section>

        <Section id="examples" title="Worked examples">
          <h3>A bookshelf (a part that carries a load)</h3>
          <p>
            <em>“A bookshelf board 90 cm long and 25 cm deep, holding about 30 kg of books, screwed to wall brackets at each end.”</em>
          </p>
          <ul>
            <li>MatSelect treats the shelf as a board supported at both ends with the load spread evenly, and allows it to sag at most span/200 (4.5 mm).</li>
            <li>Because it stays in place, the goal defaults to <em>As cheap as possible</em>.</li>
            <li>Result: a pine board about 16 mm thick for roughly $1.50 of wood — every candidate is sized to meet the same sag and strength limits, so you can compare masses and costs directly.</li>
          </ul>
          <TryIt text="A bookshelf board 90 cm long and 25 cm deep, holding about 30 kg of books, screwed to wall brackets at each end. I have woodworking tools and a drill." />
          <h3>A brake pad (a part chosen by its properties)</h3>
          <p>
            <em>“I want to design a brake pad for my motorbike.”</em>
          </p>
          <ul>
            <li>No load or span is asked. The brief says: friction coefficient 0.3–0.5 for steady braking, at least 400 °C for hard stops, outdoors, ranked by longest life (lowest wear rate).</li>
            <li>Result: carbon-ceramic for the longest life (at a very high price), sintered copper pads as the practical motorbike choice, and organic pads ruled out because they fade above about 300 °C.</li>
            <li>Switch the goal to <em>Best value for money</em> to see the affordable pads rise.</li>
          </ul>
          <TryIt text="I want to design a brake pad for my motorbike." />
          <h3>A heat sink</h3>
          <p>
            <em>“A light heat sink for an LED lamp.”</em> — ranked by thermal conductivity per kilogram, so aluminium beats copper: copper conducts better but is over three times as heavy.
          </p>
          <TryIt text="A light heat sink for an LED lamp." />
        </Section>

        <Section id="ideas" title="Key ideas, explained">
          <dl className="not-prose space-y-4 text-sm text-slate-700">
            {[
              ['Material index', 'A formula that measures how good a material is for one job. For a light, stiff beam it’s E^(1/2)/ρ (stiffness and density); for a long-lasting brake pad it’s 1/wear rate. Higher is better. It comes from the physics of the part, so it rewards exactly what matters.'],
              ['Requirements (limits)', 'Hard yes/no checks such as “works at 400 °C”. A material is ruled out only if its whole range fails; if only part of its range passes it stays in, with a flag to choose the grade carefully.'],
              ['Conservative scoring', 'Property values are ranges. Sizes and scores use the weak end of each range (e.g. the lowest strength), so the answer is safe even for a mediocre grade.'],
              ['Safety factor', 'Load-bearing parts are sized to carry more than the real load: ×1.5 for general use, ×2.5 for things that carry people, ×3 for lifting.'],
              ['Chance it’s the best', 'MatSelect re-runs the ranking 1,000 times, each time picking property values from within each material’s range. The percentage is how often a material came first.'],
              ['Likely range (p10–p90)', 'Across those runs, 80% of the results fell inside this range.'],
              ['AI-estimated data & confidence', 'Property values come from Claude’s knowledge (or the demo set), not a certified database. Each material has a confidence level; always confirm with the supplier’s datasheet.'],
              ['Number check', 'After the explanation is written, code checks that every number in it appears in the calculation results. That’s the ✓ badge.'],
            ].map(([t, d]) => (
              <div key={t} className="rounded-xl bg-slate-50 p-3">
                <dt className="font-semibold text-slate-900">{t}</dt>
                <dd className="mt-1">{d}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section id="faq" title="Questions & troubleshooting">
          <div className="not-prose space-y-2">
            <Faq q="The material I expected was ruled out — why?">
              <p>Open <strong>Ruled out</strong> and search for it: the exact reason is listed. Often it’s a requirement that’s stricter than you need (e.g. a tool you listed, or an environment). Remove it in the brief and run again.</p>
            </Faq>
            <Faq q="What does “Not evaluated” mean?">
              <p>The data needed for a requirement or the ranking was missing (or physically impossible) for that material. MatSelect never fills in missing data, so the material is set aside rather than guessed.</p>
            </Faq>
            <Faq q="Nothing fits. What now?">
              <p>Look at the most common reasons in <strong>Ruled out</strong> and relax the strictest requirement — usually tools, environment, a temperature or a budget. Press <kbd>✏️ Change requirements</kbd>.</p>
            </Faq>
            <Faq q="Why do I get different materials when I run it again?">
              <p>With Claude, the list of candidates can vary a little between runs. For the same candidates, the calculation is fully repeatable.</p>
            </Faq>
            <Faq q="Can I trust the numbers?">
              <p>The calculations are deterministic and tested. The property data is AI-estimated: treat it as a well-informed starting point and confirm the final choice with supplier datasheets — and, for anything safety-critical, with a qualified engineer.</p>
            </Faq>
            <Faq q="How do I change something after seeing the results?">
              <p>Press <kbd>✏️ Change requirements</kbd> on the results page. Your brief opens again with everything as you left it.</p>
            </Faq>
            <Faq q="It says “Cannot reach the MatSelect API”.">
              <p>The backend isn’t running. Start it with <code>npm run dev</code> in the project folder (MongoDB must be running too).</p>
            </Faq>
            <Faq q="My API key was rejected.">
              <p>Check it was copied completely, that it hasn’t been revoked, and that your Anthropic account has credit. Then paste it again in the key settings.</p>
            </Faq>
          </div>
        </Section>

        <Section id="limits" title="What it can’t do">
          <ul>
            <li>Property data comes from Claude’s knowledge or the demo set — not a verified database.</li>
            <li>Load-bearing parts use simple idealisations (one critical part, standard load cases). There’s no FEA, and joints and fatigue aren’t checked.</li>
            <li>Results are guidance, not certified design. Anything that carries people or lifts loads must follow the relevant standard and be reviewed by a qualified engineer.</li>
          </ul>
          <p className="not-prose mt-4">
            <Link href="/" className="inline-flex rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
              Start a selection →
            </Link>
          </p>
        </Section>
      </div>
    </div>
  );
}
