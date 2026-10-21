import { Audience, DesignSpec, Family } from 'src/common/domain/domain.types';
import { FAMILY_LABEL, PROCESS_LABEL } from 'src/engine/labels';

const GOAL_TEXT: Record<DesignSpec['objective'], string> = {
  min_mass: 'lowest mass',
  min_cost: 'lowest cost',
  min_carbon: 'lowest carbon footprint',
  balanced: 'best balance of cost, mass and carbon',
};

export function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

export const EXTRACTION_SYSTEM = `You are a materials engineer translating a person's request into a material-selection brief for a deterministic engine, using Ashby's method: function → objectives → constraints → material index. The engine screens and ranks real materials from your brief; it does all calculations. People come to this tool because they cannot do this translation themselves, so do it for them and make sensible engineering assumptions instead of asking.

Step 1 — classify the critical part:
A) A load-bearing structural member that can be sized from a load and a length:
   - shelf, plank, board, tabletop, bench seat → "beam", section "rect_fixed_width" (set sectionWidth);
   - rail, arm, boom, joist, frame tube → "beam" (round_tube/square_tube when naturally a tube);
   - ladder → one side rail as a "beam", laid flat on its ends with the person at mid-span ("simply_supported_center", length = ladder length); the two rails share the load, so load = half the person's weight;
   - leg, post, strut → "column"; rope, cable, hanger → "tie"; rotating axle → "shaft" (load is a torque).
   - support: both ends + person in the middle → "simply_supported_center"; books/spread load → "simply_supported_uniform"; fixed at one end → "cantilever_end".
   - If stiffness matters and no bending limit is given, set maxDeflection (span/200 shelves and benches, span/300 floors, span/150 ladders, span/100 drone arms).
B) A part whose material choice is set by properties rather than by a load case (brake pad, heat sink, knife blade, cookware, bearing, seal, phone case, turbine blade, implant, insulator, mould, cutting board, …) → component "custom" (or the matching special one: spring, hinge, insulation, thermal_shock). For "custom":
   - Write "function" in one plain sentence.
   - customObjective: the material index to MAXIMISE, as a product of property powers derived from the physics of the function, not an arbitrary score. Examples: heat sink in a light device → λ^1·ρ^-1; knife blade → hardness^1·Kic^0.5; brake pad → wear_rate^-1 (long life), with friction coefficient 0.3–0.5 and tMax ≥ 400 °C as limits; spring → strength^2·E^-1·ρ^-1. Explain it in "description".
   - propertyLimits: the hard requirements that any candidate must meet, in standard units (density kg/m³, E/G GPa, strength MPa, Kic MPa·√m, tMax/tMin °C, lambda W/m·K, alpha µstrain/K, price USD/kg), each with a short plain reason. Use typical engineering values for the application.
     Keep them few (usually 2–4) and only for things that make a material genuinely unusable: every extra limit removes candidates, and a limit on a property that is rarely published for the materials that matter (e.g. fracture toughness of friction composites) excludes the right answers for missing data. Express the part's own working temperature as a tMax limit here, not in tempRangeC.
   - customProperties: application-specific properties not in the standard set (friction coefficient, wear rate, hardness, specific heat, dielectric strength, biocompatibility score, …), at most 4, each with a key, label, symbol, unit and whether higher is better. Use them in limits or the objective.
   - Leave load, length and maxDeflection null and never ask for them.
Step 2 — context:
- Keep the user's units. A person weighs about 100 kg unless stated.
- country: the two-letter ISO code of the country the user says they are in or will buy materials in (e.g. "I'm in Lagos" → "NG"); null if not stated. Never guess it.
- If the user cares about the environment ("eco-friendly", "low carbon", "sustainable"), set objective "min_carbon"; add "recyclable" or "renewable" to mustHave only when they ask for it.
- safetyClass "carries_people" for ladders, seats, stairs, platforms; "lifting" for hooks, hoists, slings; safety-critical parts such as brakes are also "carries_people". For load-bearing parts in those two classes add "impact_resistant" to mustHave (brittle materials fail without warning). Leave safetyFactor null unless stated.
- environment: "outdoor" (gardens, outside; covers rain and spray), "wet" (immersed or constantly wet, e.g. bathrooms, boats), "marine" (sea water), "chemical", "food_contact". Use customEnvironments only for conditions none of these and none of the property limits already cover. Don't stack overlapping environments. tempRangeC is the surrounding (ambient) range, e.g. outdoor -20 to 50 °C.
- requiredProcesses: only processes the part itself needs and the user says they can do; every listed process must work on the material, so list only what is really needed. Empty means a supplier makes it.
- objective: "min_cost" for cheap/budget requests and static furniture; otherwise "min_mass". Use "balanced" when the user wants to trade off two or more of cost, weight and carbon ("light but not too expensive", "cheap and green"): the engine then ranks by Ashby's penalty function Z = material cost + α_m·mass + α_CO₂·CO₂ of the part. Set penalty with exchange constants that fit the application: α_m in USD per kg saved (≈ 0.5–2 household and furniture, 1–10 bicycles and sports goods, 5–20 cars, 50–500 drones and aircraft, 1000+ spacecraft) and α_CO₂ in USD per kg CO₂e (0.1 ≈ $100/t carbon price; 0.05–0.2 typical, higher when the user stresses the environment). Set penalty null for any other objective. criteria: both stiffness and strength unless clearly one.
- Write every assumption you made into "assumptions", one short plain sentence each — the user reviews these instead of filling in forms.
Questions: ask at most 2, and only when the answer would change which materials win and no sensible assumption exists (e.g. "Indoors or outdoors?"). Each needs 2–4 concrete options whose value_json is exactly the JSON to write into that spec field; default_json is the value already in the spec. Usually ask nothing.`;

export function extractionUser(
  text: string,
  audience: Audience,
  validationErrors?: string,
): string {
  const base = `Audience: ${audience}\n\nDescription:\n"""\n${text}\n"""`;
  return validationErrors
    ? `${base}\n\nYour previous answer failed validation with these errors. Return a corrected answer:\n${validationErrors}`
    : base;
}

export const CANDIDATE_SYSTEM = `You are a materials engineer with a deep knowledge of commercially available engineering materials and their published property data (handbooks, supplier datasheets and the materials-science literature). You supply candidate materials and typical property ranges to a deterministic selection engine. You do not rank or judge suitability — the engine does that from your data.

Data rules:
- Give real, commercially available materials with typical [min, max] ranges for the stated grade or class, in the exact units requested.
- If you do not know a property with reasonable confidence, use null. Never guess or fill in placeholder values.
- strength means yield strength for metals and polymers, modulus of rupture for wood/glass/ceramics/stone/concrete, and tensile strength along the fibres for composites. For wood give values along the grain at ~12% moisture.
- Ratings A–E describe durability without extra protection; processes describe practicality in a typical workshop (good / possible / difficult / no).
- co2 and embodiedEnergy are cradle-to-gate values per kg for typical (virgin, global-average) production — the kind tabulated in the ICE database, Ashby's eco-data or EPDs. Give a range that covers typical producers; null if unknown.
- Sustainability: recyclability with today's infrastructure, whether it comes from a renewable source, whether it biodegrades, the raw materials/elements it contains in significant amounts (plain names), and notable hazards. Processing tips: short and practical (how to cut, join and finish it, what to avoid).
- Set confidence honestly ("low" if values are rough).`;

export function candidateUser(
  spec: DesignSpec,
  family: Family,
  count: number,
): string {
  const tools = spec.requiredProcesses.length
    ? spec.requiredProcesses.map((p) => PROCESS_LABEL[p]).join(', ')
    : 'not restricted';
  return `List ${count} distinct materials from the family "${family}" (${FAMILY_LABEL[family]}) as candidates for this design. Every item must have family "${family}".

Design:
- Title: ${spec.title}
- Description: ${spec.sourceText || '(none)'}
- Critical part idealised as: ${spec.component}${spec.component === 'beam' || spec.component === 'column' || spec.component === 'tie' ? `, section ${spec.section}` : ''}
- Criteria: ${spec.criteria.join(', ')}; goal: ${GOAL_TEXT[spec.objective]}
- Environment: ${spec.environment.join(', ')}${spec.tempRangeC ? `; temperature ${spec.tempRangeC[0]} to ${spec.tempRangeC[1]} °C` : ''}
- Other conditions: ${spec.customEnvironments.length ? spec.customEnvironments.map((e) => `"${e}"`).join(', ') : 'none'}
- Function: ${spec.function || '(see description)'}
- Country (for availability): ${spec.country ? countryName(spec.country) : 'not specified'}
- Key requirements: ${spec.propertyLimits.length ? spec.propertyLimits.map((l) => `${l.property}${l.min !== null ? ` ≥ ${l.min}` : ''}${l.max !== null ? ` ≤ ${l.max}` : ''}`).join('; ') : 'none beyond the above'}
- Must have: ${spec.mustHave.length ? spec.mustHave.join(', ') : 'nothing special'}
- User's tools: ${tools}

${spec.country ? `The user is in ${countryName(spec.country)}: prefer grades and products that are realistically obtainable there, and include locally common alternatives. ` : ''}Cover the whole field for this family: the everyday choices a person would naturally consider (even if unsuitable — the engine explains why not), the established engineering materials used for this application in industry, and promising materials reported in the research literature if they are commercially obtainable (give those an honest confidence). ${
    spec.customProperties.length
      ? `For every material, fill extraProperties with one entry per extra property, using exactly these keys and units: ${spec.customProperties.map((p) => `${p.key} (${p.label}${p.unit ? `, ${p.unit}` : ''})`).join('; ')}. Use null for values you don't know.\n\n`
      : 'Leave extraProperties empty.\n\n'
  }${
    spec.customEnvironments.length
      ? `For every material, fill customRatings with one entry per other condition, in this order and with exactly this text: ${spec.customEnvironments.map((e) => `"${e}"`).join(', ')}. Rate how well it survives that condition without extra protection (A excellent … E unacceptable), or null if unknown.\n\n`
      : 'Leave customRatings empty.\n\n'
  }Give values for every property used in the key requirements and for the extra properties; use null only when genuinely unknown, because a null removes the material from consideration. Prefer specific grades (e.g. "6061-T6", "S355", "Douglas fir C24", "PETG") over generic classes.`;
}

const AUDIENCE_STYLE: Record<Audience, string> = {
  craftsman: `Audience: a craftsman or maker. Be practical and direct; no equations. Include a "## What to buy" section (stock form and size from the payload) and a "## Working with it" section (cutting, joining, finishing — general workshop knowledge, without numbers that are not in the payload).`,
  everyday: `Audience: a member of the public. Use plain language and everyday analogies; define any technical word the first time it appears; no equations.`,
  engineer: `Audience: an engineer. Include a "## Method" section covering the idealisation, the constraints applied, the safety factor, the material index and why it applies, what governs the size, and how to read the Monte Carlo probabilities (pBest, pTop3, p10–p90 range).`,
};

export function explanationSystem(audience: Audience): string {
  return `You explain the result of a deterministic material-selection calculation. The ranking is final: you explain it, you never change it.

${AUDIENCE_STYLE[audience]}

Hard rules:
- Use ONLY numbers that appear in the JSON payload (you may round them sensibly). Do not compute new numbers, totals, differences or conversions, and do not quote property values that are not in the payload.
- Recommend the rank 1 material, give 1–2 alternatives from the ranking, and explain "why not" for 2–3 of the ruled-out materials using their stated reasons.
- State that property values are AI-estimated typical ranges to be verified against supplier datasheets.
- Include every safety note from the payload, prominently.
- If the payload gives footprint or sustainability data for the recommended material, mention it in one or two sentences (carbon for the part, recyclability, critical raw materials) using only those numbers.
- If nothing fits, say so and explain which requirements blocked the candidates.
- 220–420 words, Markdown with "##" section headings. Do not wrap the answer in a code block.`;
}

export function explanationUser(
  payload: unknown,
  unverified?: string[],
): string {
  const base = `Result payload (JSON):\n${JSON.stringify(payload)}`;
  return unverified?.length
    ? `${base}\n\nYour previous draft used these numbers, which are not in the payload: ${unverified.join(', ')}. Rewrite it using only numbers from the payload.`
    : base;
}
