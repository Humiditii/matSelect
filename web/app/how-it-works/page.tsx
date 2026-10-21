import type { Metadata } from 'next';
import Link from 'next/link';
import { AshbyChartDemo } from '@/components/docs/AshbyChartDemo';
import { BeamLab } from '@/components/docs/BeamLab';
import { Callout, Cite, DocSection, Formula, Playground, Term } from '@/components/docs/docsKit';
import { Flowchart } from '@/components/docs/Flowchart';
import { MonteCarloDemo } from '@/components/docs/MonteCarloDemo';
import { PenaltyDemo } from '@/components/docs/PenaltyDemo';
import { RankingAnatomy } from '@/components/docs/RankingAnatomy';
import { ScreeningDemo } from '@/components/docs/ScreeningDemo';

export const metadata: Metadata = {
  title: 'How MatSelect works',
  description: 'The whole system explained: from your sentence to the ranked materials, the physics behind the ranking, the uncertainty, and the charts.',
};

const SECTIONS = [
  { id: 'big-picture', title: 'The big picture' },
  { id: 'brief', title: '1 · Words into a brief' },
  { id: 'candidates', title: '2 · Finding candidates' },
  { id: 'screening', title: '3 · Pass or fail' },
  { id: 'properties', title: '4 · The properties' },
  { id: 'physics', title: '5 · Sizing the part' },
  { id: 'indices', title: '6 · Material indices' },
  { id: 'goals', title: '7 · Goals and trade-offs' },
  { id: 'uncertainty', title: '8 · How sure are we?' },
  { id: 'charts', title: '9 · Reading the graphs' },
  { id: 'explain', title: '10 · The explanation' },
  { id: 'extras', title: 'Footprint and sourcing' },
  { id: 'code-map', title: 'Under the hood' },
  { id: 'limits', title: 'Honest limits' },
  { id: 'glossary', title: 'Glossary' },
  { id: 'references', title: 'References' },
];

const PROPERTIES = [
  ['ρ', 'Density', 'kg/m³', 'How heavy a block of it is. Water is 1000, steel about 7850, pine about 500.'],
  ['E', "Young's modulus (stiffness)", 'GPa', 'How hard it is to stretch or bend elastically. A steel wire barely stretches; a rubber band stretches a lot.'],
  ['G', 'Shear modulus', 'GPa', 'Stiffness against twisting. For most solids G ≈ E/2.6, which we use (and flag) when only E is known.'],
  ['σ', 'Strength', 'MPa', 'The stress where it stops springing back (yield) for metals and plastics, or breaks for wood, glass and ceramics.'],
  ['K_IC', 'Fracture toughness', 'MPa·√m', 'How well it resists a crack growing. Glass is low, steel is high.'],
  ['λ', 'Thermal conductivity', 'W/m·K', 'How fast heat flows through it. Copper is high, foam is very low.'],
  ['α', 'Thermal expansion', 'µstrain/K', 'How much it grows when it warms by one degree.'],
  ['T_max', 'Max service temperature', '°C', 'The hottest it can work at for a long time without softening or degrading.'],
  ['C', 'Price', 'USD/kg', 'Typical price of the raw material, not the finished part.'],
  ['CO₂', 'Carbon footprint', 'kg CO₂e/kg', 'Greenhouse gas released to make one kilogram of new material.'],
];

const INDEX_TABLE = [
  ['Tie (rope, cable, hanger)', 'Stiff', 'E/ρ', 'Area is the only thing that changes, so stiffness and mass both grow in step with it.'],
  ['Tie', 'Strong', 'σ/ρ', 'Same idea with strength: the classic "strength-to-weight ratio".'],
  ['Beam, shaft size free (bar, tube)', 'Stiff', 'E^½/ρ', 'Bending stiffness grows with size⁴ but mass only with size², which softens the role of E.'],
  ['Beam, size free', 'Strong', 'σ^⅔/ρ', 'Bending strength grows with size³.'],
  ['Plank or panel (width fixed)', 'Stiff', 'E^⅓/ρ', 'Only the thickness can change. Stiffness grows with thickness³, mass with thickness.'],
  ['Plank or panel', 'Strong', 'σ^½/ρ', 'Bending strength grows with thickness².'],
  ['Column', 'Doesn’t buckle', 'E^½/ρ', 'Buckling depends on I, just like bending stiffness.'],
  ['Shaft in torsion', 'Stiff / strong', 'G^½/ρ, σ^⅔/ρ', 'Twisting works like bending, with G instead of E.'],
  ['Spring', 'Stores energy', 'σ²/(E·ρ)', 'Energy stored per kg before yielding.'],
  ['Flexure hinge', 'Bends far', 'σ/E', 'How far it can bend and still spring back.'],
  ['Thermal shock', 'Survives sudden heat', 'σ/(E·α)', 'How big a sudden temperature change it survives.'],
];

const REFERENCES = [
  'M. F. Ashby, Materials Selection in Mechanical Design, 5th ed., Butterworth-Heinemann, Oxford, 2017.',
  'M. F. Ashby, “Multi-objective optimization in material design and selection,” Acta Materialia, vol. 48, no. 1, pp. 359–369, 2000.',
  'M. F. Ashby and D. Cebon, “Materials selection in mechanical design,” Journal de Physique IV, vol. 3, pp. C7-1–C7-9, 1993.',
  'P. M. Weaver and M. F. Ashby, “Material limits for shape efficiency,” Progress in Materials Science, vol. 41, no. 1–2, pp. 61–128, 1997.',
  'J. M. Gere and B. J. Goodno, Mechanics of Materials, 9th ed., Cengage Learning, 2018.',
  'N. Metropolis and S. Ulam, “The Monte Carlo method,” Journal of the American Statistical Association, vol. 44, no. 247, pp. 335–341, 1949.',
  'E. Limpert, W. A. Stahel and M. Abbt, “Log-normal distributions across the sciences: keys and clues,” BioScience, vol. 51, no. 5, pp. 341–352, 2001.',
  'G. P. Hammond and C. I. Jones, Inventory of Carbon and Energy (ICE), version 2.0, University of Bath, 2011.',
  'M. F. Ashby, Materials and the Environment: Eco-informed Material Choice, 2nd ed., Butterworth-Heinemann, 2013.',
  'Regulation (EU) 2024/1252 of the European Parliament and of the Council (Critical Raw Materials Act), Annex II, 2024.',
  'ISO 14040:2006, Environmental management — Life cycle assessment — Principles and framework.',
];

const GLOSSARY = [
  ['Brief', 'The structured list of requirements the engine works from: goal, loads, environment, must-haves, limits.'],
  ['Candidate', 'A material that is being considered. About 60 per request.'],
  ['Screening', 'The pass/fail round: requirements a material must meet to be considered at all.'],
  ['Constraint', 'Something the part must never do: bend too much, break, rust, melt.'],
  ['Objective', 'The thing to make as small (or as large) as possible: mass, cost, carbon.'],
  ['Free variable', 'What the designer is allowed to change, usually the thickness of the part.'],
  ['Material index', 'A combination of properties, like E^½/ρ, that measures how good a material is for one job. Higher is better.'],
  ['Second moment of area (I)', 'A number that says how well a cross-section resists bending. Material far from the centre counts much more.'],
  ['Safety factor', 'Extra margin: with a factor of 1.5, the part is designed to carry 1.5 times the real load.'],
  ['Monte Carlo', 'Repeating a calculation many times with random inputs to see how much the answer can vary.'],
  ['p10 – p90', 'The range that holds the middle 80 % of the random results.'],
  ['Pareto (trade-off) front', 'The materials that no other material beats on both of two goals at once.'],
  ['Penalty function', 'One number, Z, that adds cost, mass and carbon together on a dollar scale so they can be traded off.'],
  ['Exchange constant (α)', 'How many dollars one kilogram saved, or one kilogram of CO₂ avoided, is worth to you.'],
  ['CO₂e', '"Carbon dioxide equivalent": all greenhouse gases, counted as the amount of CO₂ that would warm the planet as much.'],
];

const FRACTION: Record<string, string> = { '½': '1/2', '⅓': '1/3', '⅔': '2/3' };

/** Writes "E^½/ρ" with a real superscript. */
function IndexText({ text }: { text: string }) {
  const parts = text.split(/\^([½⅓⅔])/);
  return <>{parts.map((part, i) => (i % 2 ? <sup key={i}>{FRACTION[part]}</sup> : part))}</>;
}

export default function HowItWorksPage() {
  return (
    <div className="lg:grid lg:grid-cols-[220px_1fr] lg:gap-8">
      <aside className="mb-6 lg:mb-0">
        <nav className="lg:sticky lg:top-20">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">On this page</p>
          <ol className="flex gap-2 overflow-x-auto pb-2 text-sm lg:flex-col lg:gap-1 lg:overflow-visible">
            {SECTIONS.map((section) => (
              <li key={section.id} className="shrink-0">
                <a href={`#${section.id}`} className="block whitespace-nowrap rounded-lg px-2 py-1 text-slate-600 hover:bg-white hover:text-slate-900 lg:whitespace-normal">
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
          <Link href="/tutorial" className="mt-4 hidden text-sm font-medium text-brand-700 hover:underline lg:block">
            Just want to use it? Read the tutorial →
          </Link>
        </nav>
      </aside>

      <div className="min-w-0 space-y-6">
        <header>
          <p className="text-sm font-medium text-brand-700">Documentation</p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">How MatSelect works</h1>
          <p className="mt-3 max-w-3xl text-slate-600">
            This page follows one request all the way through the system: from the sentence you type, to the brief, to the materials, the physics that sizes and ranks them, the uncertainty check, and finally the graphs on your screen.
          </p>
          <p className="mt-2 max-w-3xl text-slate-600">
            If you have done physics at school, you can follow all of it. Whenever there is an equation, there is a plain-words version right next to it, and most of the ideas come with a small demo you can play with. If you already know the engineering, the references at the bottom point to the original sources.
          </p>
        </header>

        <DocSection id="big-picture" kicker="Start here" title="The big picture">
          <p>
            Choosing a material sounds like a matter of opinion (&ldquo;use aluminium, it&rsquo;s light&rdquo;) but it doesn&rsquo;t have to be. Since the 1980s, engineers have had a systematic way to do it, developed by Michael Ashby at Cambridge
            <Cite n={1} />
            <Cite n={3} />. You describe what the part has to do, turn that into physics, and let the numbers decide. MatSelect is that method, automated.
          </p>
          <Callout icon="⚖️" title="The one rule that shapes everything">
            The AI, a large language model (LLM), is used for language: reading your description, suggesting candidate materials with their typical properties, and writing the final explanation. It never decides which material wins. Every &ldquo;fits / doesn&rsquo;t fit&rdquo; and every
            position in the ranking comes from ordinary code doing engineering calculations, and every number the AI writes is checked against those calculations.
          </Callout>
          <p>Here is the whole journey. Click any box to see what happens there.</p>
          <Flowchart />
          <h3>The three pieces of software</h3>
          <div className="not-prose grid gap-3 sm:grid-cols-3">
            {[
              ['🖥️', 'Web app', 'Next.js (React)', 'What you see and click. It sends requests and draws the results and charts.'],
              ['⚙️', 'API', 'NestJS (Node.js)', 'The brain. It talks to the LLM, runs the engine (all the physics) and stores results.'],
              ['🗄️', 'Database', 'MongoDB', 'Keeps every finished selection, so you can come back to it or share the link.'],
            ].map(([icon, title, tech, text]) => (
              <div key={title} className="rounded-xl bg-slate-50 p-4 text-sm">
                <div className="text-2xl">{icon}</div>
                <p className="mt-1 font-semibold text-slate-900">
                  {title} <span className="font-normal text-slate-500">· {tech}</span>
                </p>
                <p className="mt-1 text-slate-600">{text}</p>
              </div>
            ))}
          </div>
          <p>
            Inside the API, the <Term>engine</Term> (the folder <code>api/src/engine</code>) is kept completely separate from everything else. It takes a brief and a list of materials and returns a ranking. It has no idea the LLM exists, it never touches the
            internet, and given the same inputs it always gives exactly the same answer. That makes it easy to test: there are hand-checked tests for every formula.
          </p>
        </DocSection>

        <DocSection id="brief" kicker="Step 1" title="From your words to a brief">
          <p>
            People don&rsquo;t say &ldquo;I need a simply supported beam with a 5 mm deflection limit&rdquo;. They say &ldquo;a shelf for my books, 90 cm long&rdquo;. The first job is to translate. Ashby&rsquo;s method asks four questions about any part
            <Cite n={1} />:
          </p>
          <div className="not-prose my-4 grid gap-3 sm:grid-cols-2">
            {[
              ['Function', 'What does it do?', 'Hold books up across a gap.'],
              ['Constraints', 'What must it never do?', 'Sag so much you notice, or break. Rot if it’s in a damp room.'],
              ['Objective', 'What should be as small as possible?', 'Cost, since a shelf doesn’t move and weight barely matters.'],
              ['Free variables', 'What are we allowed to change?', 'The thickness of the board, and the material.'],
            ].map(([title, question, example]) => (
              <div key={title} className="rounded-xl p-4 text-sm ring-1 ring-slate-200">
                <p className="font-semibold text-slate-900">{title}</p>
                <p className="text-slate-600">{question}</p>
                <p className="mt-2 rounded-lg bg-slate-50 px-2 py-1 text-slate-700">📚 {example}</p>
              </div>
            ))}
          </div>
          <p>
            The LLM is given these rules (and many worked examples) and fills in a structured brief: what kind of part it is, the load and span, the goal, the environment, the tools you mentioned, any must-haves, and a list of every assumption it had to make,
            in plain sentences. A person of about 100 kg, a deflection limit of span/200 for a shelf, outdoor temperatures from &minus;20 to 50 °C: these are written down so you can see and remove them.
          </p>
          <p>
            Parts that aren&rsquo;t simple beams, like a brake pad or a heat sink, are handled differently. There&rsquo;s no load case to size, so the LLM writes down the <Term>hard limits</Term> (a brake pad must survive at least 400 °C) and the{' '}
            <Term>material index</Term> to maximise (for a brake pad, long life means a low wear rate). More on indices in step 6.
          </p>
          <Callout icon="🧪" title="No API key? Still works.">
            Without an LLM key, a set of keyword rules does the translation for common parts (shelves, ladders, benches, brake pads, heat sinks and so on). It is less flexible but uses exactly the same brief format, so everything after this step is identical.
          </Callout>
          <p>
            Finally, everything is converted to SI units (newtons, metres, pascals) so the physics never mixes up centimetres and inches. If a unit is unknown, you get a clear error listing the ones that are supported, rather than a silent guess.
          </p>
        </DocSection>

        <DocSection id="candidates" kicker="Step 2" title="Finding candidate materials">
          <p>
            A common mistake in design is to only ever consider the materials you already know. Ashby&rsquo;s advice is the opposite: start with <em>every</em> material and let the requirements narrow the field
            <Cite n={1} />. So MatSelect asks for candidates from all six families at once:
          </p>
          <div className="not-prose my-3 flex flex-wrap gap-2 text-sm">
            {['⚙️ Metals', '🧴 Plastics', '🏺 Ceramics & glass', '🧵 Composites', '🌳 Wood & natural', '🧽 Foams & rubbers'].map((family) => (
              <span key={family} className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                {family}
              </span>
            ))}
          </div>
          <p>
            Six requests go to the LLM at the same time, one per family, each asking for 10 real, commercially available materials suited to your design, so about 60 candidates in total. If one family fails (a timeout, say), the others carry on and a note tells
            you which family was skipped.
          </p>
          <h3>Ranges, not single numbers</h3>
          <p>
            Each material comes with a <Term>range</Term> for every property, never a single value. &ldquo;Pine: stiffness 7.4–12 GPa&rdquo; is honest. Real wood varies with species, moisture and knots; steel varies with grade and supplier. Pretending
            it&rsquo;s exactly 10 GPa would hide that. Those ranges are what make the uncertainty check in step 8 possible. If the LLM doesn&rsquo;t know a value with reasonable confidence, it must say <code>null</code> (unknown), and the engine will never
            fill it in.
          </p>
          <p>Along with the mechanical properties, each material comes with:</p>
          <ul>
            <li>durability ratings from A (excellent) to E (poor) for fresh water, salt water, sunlight and chemicals;</li>
            <li>how practical it is to cut, drill, weld, glue, bend, cast, mould or 3D-print, from &ldquo;good&rdquo; to &ldquo;no&rdquo;;</li>
            <li>its carbon footprint and embodied energy per kg, recyclability, and any hazards;</li>
            <li>the references the values came from.</li>
          </ul>
          <h3>Checking the data before using it</h3>
          <p>An AI can make mistakes, so every number is checked before the engine sees it:</p>
          <ul>
            <li>
              <strong>Physically impossible values are rejected.</strong> Nothing is denser than 25 000 kg/m³ or stiffer than 1300 GPa (diamond is about 1050). A material with an impossible value goes to &ldquo;invalid data&rdquo; and is set aside.
            </li>
            <li>
              <strong>Reversed ranges are fixed</strong> (&ldquo;max 50, min 30&rdquo; becomes 30–50).
            </li>
            <li>
              <strong>Very wide ranges are flagged.</strong> If the high end is more than 30 times the low end, the material is kept but marked as uncertain.
            </li>
            <li>
              <strong>Contradictions are removed.</strong> A shear modulus G bigger than E is impossible for a normal solid, so that G is discarded.
            </li>
            <li>
              <strong>Duplicates are removed</strong>, so the same steel doesn&rsquo;t take up two places in the ranking.
            </li>
          </ul>
        </DocSection>

        <DocSection id="screening" kicker="Step 3" title="Pass or fail: screening">
          <p>
            Before any ranking, every material faces a set of yes/no questions. These are the requirements that no amount of &ldquo;goodness&rdquo; elsewhere can make up for. A super-light material that rusts away in a year is no use for a garden bench.
          </p>
          <ul>
            <li>
              <strong>Environment.</strong> Outdoors needs at least a C for water and sunlight. Constantly wet, sea water and chemicals need a B. If you typed your own condition (&ldquo;next to a chlorinated pool&rdquo;), the LLM rates every material for it and a B
              or better is needed.
            </li>
            <li>
              <strong>Temperature.</strong> The material&rsquo;s <em>lowest</em> quoted maximum temperature must reach your hottest condition. If the range is 80–100 °C and you need 90 °C, it fails, because the weaker grade wouldn&rsquo;t cope.
            </li>
            <li>
              <strong>Your tools.</strong> If you said you only have a hand saw, anything rated &ldquo;difficult&rdquo; or &ldquo;no&rdquo; for hand cutting is out.
            </li>
            <li>
              <strong>Must-haves</strong> such as transparent, electrical insulator, impact resistant (no brittle materials where people could get hurt), recyclable or renewable.
            </li>
            <li>
              <strong>Property limits</strong> such as &ldquo;friction coefficient at least 0.3&rdquo;. Here the rule is fair to ranges: a material fails only if its <em>whole</em> range misses the limit. If the range straddles the limit, it passes with a
              warning to choose the grade carefully.
            </li>
          </ul>
          <Callout icon="🙅" title="Missing data is never guessed">
            If the data needed to judge a requirement is missing (say, no salt-water rating for a marine part), the material isn&rsquo;t ruled out and isn&rsquo;t passed either. It goes to a separate &ldquo;Not evaluated&rdquo; list. Guessing would make the result
            look more certain than it is.
          </Callout>
          <Playground title="Switch requirements on and off" hint="These are seven real materials from the built-in data, checked with the same rules the engine uses.">
            <ScreeningDemo />
          </Playground>
          <p>Every material that fails keeps its reason. On the results page you can read exactly why each one was ruled out, which is often as useful as knowing the winner.</p>
        </DocSection>

        <DocSection id="properties" kicker="Step 4" title="The material properties, in plain words">
          <p>The engine works with a small set of properties. If you remember one idea from physics class, make it this one:</p>
          <Formula says="Stress is force spread over an area. Strain is how much it stretches, as a fraction of its length. Their ratio is the stiffness E.">
            σ = F / A &nbsp;&nbsp;&nbsp; ε = ΔL / L &nbsp;&nbsp;&nbsp; E = σ / ε
          </Formula>
          <p>
            That is Hooke&rsquo;s law. Pull on a bar and it stretches a little; let go and it springs back. <Term>E</Term> (Young&rsquo;s modulus) is how hard you have to pull to stretch it. Pull harder and eventually it stops springing back (it yields) or
            snaps: that stress is the <Term>strength</Term>. Stiffness and strength are different things: a glass rod is very stiff but snaps easily; a nylon rope is floppy but strong.
          </p>
          <div className="not-prose my-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Symbol</th>
                  <th className="py-2 pr-3">Property</th>
                  <th className="py-2 pr-3">Unit</th>
                  <th className="py-2">In everyday words</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {PROPERTIES.map(([symbol, name, unit, meaning]) => (
                  <tr key={symbol}>
                    <td className="py-2 pr-3 font-serif text-base italic text-slate-900">{symbol}</td>
                    <td className="py-2 pr-3 font-medium text-slate-900">{name}</td>
                    <td className="whitespace-nowrap py-2 pr-3 text-slate-600">{unit}</td>
                    <td className="py-2 text-slate-700">{meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>Which end of the range?</h3>
          <p>
            When the engine needs one number from a range, it takes the <Term>conservative</Term> one, meaning the end that makes the material look worse: the low end of stiffness and strength, the high end of thermal expansion. For density, price and carbon
            it uses the middle (the geometric mean, √(low × high), which suits values that vary by percentages rather than fixed amounts). The idea: if a material wins with its weakest data, it will win with its real data too.
          </p>
        </DocSection>

        <DocSection id="physics" kicker="Step 5" title="The physics: sizing the part">
          <p>
            If you gave a load and a length, the engine can answer a very practical question for every material: <em>how thick does the part need to be, and so how heavy (and expensive) will it be?</em> This is where materials that look different on paper
            become directly comparable. A beam in steel and a beam in pine can both hold your books; the question is which one does it with the least mass or money.
          </p>
          <h3>Bending, and why tubes and I-beams work</h3>
          <p>
            Put a load in the middle of a plank and it sags. The top surface gets squashed, the bottom gets stretched, and the middle hardly does anything. So material far from the middle does most of the work. This is captured by the{' '}
            <Term>second moment of area</Term>, I. For a square bar of side s, and for a plank of width b and thickness t:
          </p>
          <Formula says="Double the thickness of a plank and it becomes 8 times stiffer. That is why a plank on edge is so much stiffer than one lying flat.">
            I<sub>square</sub> = s⁴ / 12 &nbsp;&nbsp;&nbsp;&nbsp; I<sub>plank</sub> = b·t³ / 12
          </Formula>
          <p>The sag (deflection δ) of a beam with a point load F over a span L is a standard result from mechanics of materials<Cite n={5} />:</p>
          <Formula says="Sag grows with the cube of the span: a shelf twice as long sags 8 times more. Stiffer material (E) or a deeper section (I) reduce it.">
            δ = F·L³ / (C·E·I)
          </Formula>
          <p>
            C depends on how the beam is held: 48 for a beam resting on both ends with the load in the middle, 384/5 for a load spread evenly along it, and 3 for a cantilever (fixed at one end, load at the tip). The engine flips this around: given the sag you
            can accept, what I is needed, and so what size?
          </p>
          <p>
            It does the same for <Term>strength</Term>. The bending moment M = k·F·L (k is ¼ for a central load on two supports, 1 for a cantilever) creates a peak stress M/Z in the outer fibres, where Z = I/(half the depth) is the section modulus. That stress
            must stay below the strength divided by the <Term>safety factor</Term>:
          </p>
          <Formula says="The safety factor is 1.5 for everyday items, 2.5 for anything carrying people, and 3 for lifting gear.">M / Z ≤ σ / SF</Formula>
          <p>
            Each check gives a minimum size. The bigger one wins, and the engine tells you which one it was (&ldquo;size is set by the deflection limit&rdquo;). Then mass is simple: <strong>mass = density × area × length</strong>. Cost and carbon are just mass
            times the price and footprint per kg.
          </p>
          <h3>Other kinds of parts</h3>
          <ul>
            <li>
              <strong>Ties</strong> (ropes, rods, hangers) just stretch: area needed = F·SF/σ for strength, or F·L/(E·δ) for stretch.
            </li>
            <li>
              <strong>Columns</strong> (legs, posts) can fail by crushing (F/A reaching σ) but more often by <strong>buckling</strong>: push the ends of a plastic ruler and it suddenly bows sideways long before the plastic itself fails. Euler worked out the
              load where that happens: F = π²·E·I / (K·L)², where K depends on how the ends are held<Cite n={5} />.
            </li>
            <li>
              <strong>Shafts</strong> twist. The twist angle is θ = T·L/(G·J), with J the polar moment (the twisting version of I). For strength, the shear stress must stay below σ/(√3·SF): that √3 comes from the von Mises yield criterion, which links
              shear yield to tensile yield.
            </li>
          </ul>
          <Playground title="The beam lab" hint="Change the load, span and shape, and watch every material get sized. Click a material to see the full working with real numbers.">
            <BeamLab />
          </Playground>
          <Callout icon="🔍" title="Things to notice in the lab">
            Switch the shape from <em>solid square bar</em> to <em>plank</em> and watch wood climb the ranking. Make the span long and the load small and stiffness takes over from strength; make the span short and the load big and strength takes over. The
            next section explains why the order changes the way it does.
          </Callout>
        </DocSection>

        <DocSection id="indices" kicker="Step 6" title="Material indices: the clever bit">
          <p>
            Sizing every material works, but it hides a beautiful idea. Let&rsquo;s do the algebra once for a light, stiff beam with a square cross-section of side s, and see what falls out.
          </p>
          <ol>
            <li>
              The mass is <span className="font-serif">m = ρ·A·L = ρ·s²·L</span>.
            </li>
            <li>
              The stiffness requirement says <span className="font-serif">δ = F·L³ / (C·E·I)</span> with <span className="font-serif">I = s⁴/12</span>. Solve for the size we need: <span className="font-serif">s² = (12·F·L³ / (C·δ))<sup>½</sup> · E<sup>−½</sup></span>.
            </li>
            <li>Put that size back into the mass:</li>
          </ol>
          <Formula says="The first bracket is fixed by the job (load, span, allowed sag). Only the last bracket depends on the material.">
            m = (12·F / (C·δ))<sup>½</sup> · L<sup>5/2</sup> · ( ρ / E<sup>½</sup> )
          </Formula>
          <p>
            So whatever the load and span, the lightest beam is always the one made of the material with the smallest ρ/E<sup>½</sup>, or, flipping it over, the biggest <strong>E<sup>½</sup>/ρ</strong>. That is a <Term>material index</Term>
            <Cite n={1} />
            <Cite n={3} />. It lets you rank materials for a job without knowing any of the design numbers. The engine derives the right exponents automatically from how the section grows with its size (area ∝ s<sup>pA</sup>, I ∝ s<sup>pI</sup> gives the
            index E<sup>pA/pI</sup>/ρ).
          </p>
          <h3>Why the shape changes the answer</h3>
          <p>
            For a <strong>tie</strong> (a rope), the index is simply E/ρ: no shape effect, so a material twice as stiff is twice as good. For a <strong>beam</strong> it&rsquo;s E<sup>½</sup>/ρ: being stiffer helps less, and being light matters more. For a{' '}
            <strong>plank</strong> of fixed width, it&rsquo;s E<sup>⅓</sup>/ρ: stiffness barely matters at all compared with density. This is the deep reason why wood, which is not very stiff but is very light, is unbeatable for floorboards and shelves, and
            why aircraft panels are made of light materials rather than stiff ones<Cite n={4} />.
          </p>
          <div className="not-prose my-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Part</th>
                  <th className="py-2 pr-3">Must be</th>
                  <th className="py-2 pr-3">Maximise</th>
                  <th className="py-2">Why</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {INDEX_TABLE.map(([part, need, index, why]) => (
                  <tr key={part + need}>
                    <td className="py-2 pr-3 font-medium text-slate-900">{part}</td>
                    <td className="py-2 pr-3 text-slate-700">{need}</td>
                    <td className="whitespace-nowrap py-2 pr-3 font-serif text-base italic text-slate-900">
                      <IndexText text={index} />
                    </td>
                    <td className="py-2 text-slate-700">{why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>The Ashby chart</h3>
          <p>
            Ashby&rsquo;s best-known trick is to plot materials on log scales, stiffness against density. On such a chart, &ldquo;E<sup>½</sup>/ρ = a constant&rdquo; is a straight line (taking logs, log E = 2·log ρ + constant, a line of slope 2). Every
            material above the line beats every material below it. Slide the line up and you are demanding more; whatever stays above is your shortlist.
          </p>
          <Playground title="Your own Ashby chart" hint="Pick a part type, then drag the slider. Hover a bubble for its numbers. The bubbles span each material’s property ranges.">
            <AshbyChartDemo />
          </Playground>
          <h3>Parts with their own index</h3>
          <p>
            For parts that aren&rsquo;t beams, the LLM proposes an index from the physics of the job, written as a product of properties raised to powers, for example a knife blade: hardness¹ × toughness<sup>½</sup>. The engine evaluates it exactly the same
            way: for each property it takes the end of the range that makes the material look worse (low end if the power is positive, high end if negative).
          </p>
          <h3>When there are two indices</h3>
          <p>
            A beam that must be both stiff and strong has two indices. The engine scores each material on each index as a percentage of the best material for that index, then keeps the <strong>lower</strong> of the two. This is a &ldquo;maximin&rdquo; rule:
            a material is only as good as its weakest side. A material that is brilliant at stiffness but poor at strength can&rsquo;t hide behind its strong point.
          </p>
        </DocSection>

        <DocSection id="goals" kicker="Step 7" title="Goals: lightest, cheapest, greenest, or balanced">
          <p>
            Up to now the goal was &ldquo;as light as possible&rdquo;. The other goals are a small change. To find the <strong>cheapest</strong> part, multiply the mass by the price per kg; the index ρ becomes ρ·C (so E<sup>½</sup>/ρ becomes E<sup>½</sup>
            /(ρ·C)). For the <strong>lowest carbon</strong>, multiply by the carbon footprint per kg instead. A heavy material with a tiny footprint per kg (steel, timber) can then beat a light one with a big footprint (aluminium, carbon fibre).
          </p>
          <h3>When you care about more than one thing</h3>
          <p>
            Most real choices are a compromise: &ldquo;light, but not crazy expensive&rdquo;. Lightest and cheapest usually point to different materials, so which one wins? Ashby&rsquo;s answer is the <Term>penalty function</Term>
            <Cite n={2} />. Put everything on the same scale, money, by asking how much each thing is worth to you:
          </p>
          <Formula says="Z is the 'total badness' of a design in dollars. The lowest Z wins.">
            Z = cost + α<sub>m</sub> · mass + α<sub>CO₂</sub> · CO₂
          </Formula>
          <p>
            The <Term>exchange constants</Term> α are the key. α<sub>m</sub> is what one kilogram saved is worth: next to nothing for a shelf (it never moves), about $1–10 for a bicycle, $10–20 for a car part (less fuel over its life), hundreds of dollars for a
            drone or an aircraft part, and thousands for spacecraft<Cite n={2} />. α<sub>CO₂</sub> is a carbon price: $100 per tonne of CO₂ is $0.10 per kg. The LLM suggests values for your application, and you can change them on the brief.
          </p>
          <Playground title="Trade cost against weight and carbon" hint="A 50 cm arm fixed to a wall, holding 20 kg at its tip. Move the sliders and watch the winner change.">
            <PenaltyDemo />
          </Playground>
          <p>
            Notice that the winner sits on the blue dots, the <Term>trade-off front</Term> (also called the Pareto front). A grey dot is beaten on both mass and cost by something else, so no value of α<sub>m</sub> can make it win; only a big carbon
            advantage (a third axis this chart doesn&rsquo;t show) could rescue it. The exchange constants just decide <em>where</em> along the front you land.
          </p>
        </DocSection>

        <DocSection id="uncertainty" kicker="Step 8" title="How sure are we? The Monte Carlo check">
          <p>
            The ranking so far used one value per property (the conservative end). But each property is really a range. What if pine from your timber yard happens to be at the stiff end of its range and Douglas fir at the floppy end? Could the order flip?
          </p>
          <p>
            The engine answers this by brute force, using a <Term>Monte Carlo simulation</Term>
            <Cite n={6} />. It repeats the whole ranking 1000 times. Each time, every property of every material is drawn at random from inside its range, the part is re-sized (or the index re-scored) and the materials are re-ranked. Then it counts:
          </p>
          <ul>
            <li>
              <strong>Chance it&rsquo;s the best:</strong> in what fraction of the 1000 runs did it come first?
            </li>
            <li>
              <strong>Chance in the top 3.</strong>
            </li>
            <li>
              <strong>Likely range:</strong> the 10th to 90th percentile of its results (the middle 80 %), which is the thin line on the ranking chart.
            </li>
          </ul>
          <Playground title="Run the simulation yourself" hint="Douglas fir against pine for a light, stiff beam. Draw once to see a single run, then add a thousand.">
            <MonteCarloDemo />
          </Playground>
          <h3>Why random, but not too random</h3>
          <p>
            Values are drawn <strong>log-uniformly</strong>: equally likely to fall in any equal <em>ratio</em> of the range (10–20 is as likely as 20–40) rather than any equal <em>step</em>. Material properties tend to vary by percentages, not by fixed amounts,
            which is the same reason so many natural quantities follow log-normal distributions<Cite n={7} />.
          </p>
          <p>
            And the &ldquo;random&rdquo; numbers are <strong>repeatable</strong>. The starting point (the seed) is calculated from your brief and the materials, using a hash. Same request, same 1000 runs, same answer, every time. That makes the results
            trustworthy and testable, and means refreshing the page never changes your numbers.
          </p>
          <Callout icon="🤝" title="Close calls are flagged">
            If the top two are within 15 percentage points on &ldquo;chance it&rsquo;s the best&rdquo;, and at least one of them wins a fifth of the runs or more, the results page says it&rsquo;s a close call. Either could be the better choice once you have real
            supplier data.
          </Callout>
        </DocSection>

        <DocSection id="charts" kicker="Step 9" title="Reading the graphs">
          <p>The results page has a &ldquo;Compare visually&rdquo; card with two charts. Both are drawn from numbers the engine has already calculated; nothing new is worked out in the browser.</p>
          <h3>📊 The ranking chart</h3>
          <p>One bar per material, best first. Hover the notes to see what each part of the chart tells you.</p>
          <div className="not-prose my-4 rounded-2xl p-4 ring-1 ring-slate-200">
            <RankingAnatomy />
          </div>
          <h3>⚖️ The trade-off chart</h3>
          <p>
            This is the chart you saw in the penalty demo above: mass across the bottom, cost (or carbon, with the toggle) up the side, one dot per material. A few things to know:
          </p>
          <ul>
            <li>
              <strong>Both axes are logarithmic</strong>: each grid line is ten times the one before. Materials differ by factors of 10 or 100 (carbon fibre costs about 40 times more per kg than steel), and on an ordinary axis most dots would be squashed
              into a corner.
            </li>
            <li>
              <strong>Down and to the left is better</strong>: lighter and cheaper.
            </li>
            <li>
              <strong>Blue dots</strong> are the trade-off front. <strong>Grey dots</strong> are beaten on both counts by a blue one.
            </li>
            <li>
              With the balanced goal, <strong>dashed lines</strong> join designs with the same penalty Z. The top pick sits on the lowest one.
            </li>
            <li>
              For parts with no load and length, the chart uses &ldquo;mass for the same performance&rdquo;, relative to the lightest candidate, worked out from the mass-based index. A value of 2× means you&rsquo;d need twice the mass to do the same job.
            </li>
          </ul>
          <p>
            If you prefer numbers, every chart has a <strong>Table</strong> view, and hovering (or tapping) any bar or dot shows its exact values.
          </p>
        </DocSection>

        <DocSection id="explain" kicker="Step 10" title="The explanation, and why you can trust its numbers">
          <p>
            Last, the LLM writes the explanation in the style you picked: short and practical for a craftsman, plain for everyday users, or with indices and assumptions for engineers. It is given only the calculated results: the ranking, sizes, reasons and
            warnings.
          </p>
          <p>
            Language models sometimes invent numbers that sound right. So before you see the text, code reads every number in it and looks for that number in the calculation results, allowing for rounding, percentages and unit changes (0.25 m written as 250
            mm, for example). Names that contain digits, like &ldquo;6061-T6&rdquo; or &ldquo;S355&rdquo;, are ignored.
          </p>
          <ul>
            <li>If every number checks out, the explanation gets a green &ldquo;every number checked&rdquo; badge.</li>
            <li>If any number can&rsquo;t be traced, the LLM is asked once more, told exactly which numbers were wrong. The better of the two answers is kept, and any doubtful numbers are listed openly.</li>
            <li>If the LLM is unavailable, a template explanation built from the same numbers is used, so the result never depends on the AI being up.</li>
          </ul>
        </DocSection>

        <DocSection id="extras" kicker="Beyond the ranking" title="Footprint, sustainability and where to buy">
          <ul>
            <li>
              <strong>Carbon and energy footprint.</strong> For a sized part, it&rsquo;s the part&rsquo;s mass times the material&rsquo;s cradle-to-gate footprint per kg: everything from mining to the factory gate, for new (virgin) material, the kind of figure
              tabulated in the ICE database and Ashby&rsquo;s eco-data
              <Cite n={8} />
              <Cite n={9} />. It is a first estimate, not a full life cycle assessment in the sense of ISO 14040<Cite n={11} />: use, transport and end of life aren&rsquo;t included.
            </li>
            <li>
              <strong>Critical raw materials.</strong> Each material lists what it contains, and code checks that list against the EU&rsquo;s official list of 34 critical raw materials<Cite n={10} />. The AI never decides what counts as critical.
            </li>
            <li>
              <strong>How easy it is to work.</strong> A score from six everyday workshop processes (hand cutting, power cutting, drilling, gluing, fastening, bending): 2 points for &ldquo;good&rdquo;, 1 for &ldquo;possible&rdquo;. 9 or more is easy, 5 or more
              moderate.
            </li>
            <li>
              <strong>Where to buy.</strong> With an LLM key, a live web search looks for suppliers of the top three materials in your country. Without one, you get guidance and ready-made search links.
            </li>
          </ul>
        </DocSection>

        <DocSection id="code-map" kicker="For developers" title="Under the hood: the code map">
          <p>If you want to read or change the code, this is where each step lives.</p>
          <div className="not-prose my-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Step</th>
                  <th className="py-2 pr-3">Request</th>
                  <th className="py-2">Code</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 align-top">
                {[
                  ['Words → brief', 'POST /api/specs/extract', 'core/spec/, core/llm/prompts/, core/llm/mock/mock.extraction.ts'],
                  ['Find materials', 'POST /api/selections', 'core/selection/selection.service.ts → core/material/material.service.ts'],
                  ['Check data', '', 'engine/validate.ts'],
                  ['Screening', '', 'engine/screening.ts'],
                  ['Physics', '', 'engine/section.ts, sizing.ts, indices.ts, evaluation.ts'],
                  ['Goals and penalty', '', 'engine/design.ts, evaluation.ts, chartData.ts'],
                  ['Monte Carlo', '', 'engine/monteCarlo.ts, random.ts'],
                  ['Reasons and warnings', '', 'engine/reasons.ts'],
                  ['Explanation', 'POST /api/selections/:id/explain', 'core/explanation/, core/selection/util/grounding.util.ts'],
                  ['Read a result', 'GET /api/selections/:id', 'core/selection/ (MongoDB collection material_selections)'],
                  ['Where to buy', 'POST /api/selections/:id/sourcing', 'core/sourcing/'],
                  ['Charts', '', 'web/components/charts/'],
                ].map(([step, request, code]) => (
                  <tr key={step}>
                    <td className="py-2 pr-3 font-medium text-slate-900">{step}</td>
                    <td className="whitespace-nowrap py-2 pr-3 font-mono text-xs text-slate-600">{request}</td>
                    <td className="py-2 font-mono text-xs text-slate-700">{code}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Paths under <code>core/</code> and <code>engine/</code> are in <code>api/src/</code>. The API key is chosen in this order: the server&rsquo;s own key, then a key you saved in your browser, then the built-in demo data. The full backend guide is in{' '}
            <code>api/README.md</code>.
          </p>
        </DocSection>

        <DocSection id="limits" kicker="Read this before you build" title="Honest limits">
          <ul>
            <li>Property values are typical ranges suggested by an AI, then sanity-checked. They are not certified datasheet values. Always confirm with your supplier before building anything that matters.</li>
            <li>The physics models are the standard textbook ones: linear elastic, simple supports, static loads. Fatigue (failure after millions of small loads), creep, impact and joints are not calculated.</li>
            <li>Composites and wood behave differently along and across the grain or fibres. The values used are along the strong direction.</li>
            <li>Carbon footprints are cradle-to-gate for new material, which can be very different for recycled material.</li>
            <li>Results are guidance for choosing a material, not a certified design. For anything that carries people or loads over people, have it checked by a qualified engineer.</li>
          </ul>
        </DocSection>

        <DocSection id="glossary" title="Glossary">
          <dl className="not-prose grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            {GLOSSARY.map(([term, meaning]) => (
              <div key={term}>
                <dt className="font-semibold text-slate-900">{term}</dt>
                <dd className="text-slate-700">{meaning}</dd>
              </div>
            ))}
          </dl>
        </DocSection>

        <DocSection id="references" title="References">
          <ol className="text-sm">
            {REFERENCES.map((ref, i) => (
              <li key={ref} id={`ref-${i + 1}`} className="scroll-mt-24">
                {ref}
              </li>
            ))}
          </ol>
          <p className="text-sm">
            Reference [1] is the best place to start if you want to go deeper: it is readable, full of worked examples, and every idea on this page comes from it.
          </p>
        </DocSection>

        <div className="flex flex-wrap gap-3">
          <Link href="/" className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            Try a selection →
          </Link>
          <Link href="/tutorial" className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">
            Read the tutorial
          </Link>
        </div>
      </div>
    </div>
  );
}
