// Demo explanations, templated from the payload so every number in them is grounded.
import { Audience } from 'src/common/domain/domain.types';
import { formatNumber, formatUsd } from 'src/engine/labels';
import { ExplanationPayload } from 'src/core/selection/util/explanationPayload.util';

type RankedEntry = ExplanationPayload['ranked'][number];

const nameWithGrade = (entry: { name: string; grade: string | null }) =>
  entry.grade ? `${entry.name} (${entry.grade})` : entry.name;
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

function headline(entry: RankedEntry, payload: ExplanationPayload): string {
  if (payload.mode === 'sizing' && entry.size) {
    let value: string;
    if (payload.objective.unit === 'USD eq.')
      value = `penalty about ${formatUsd(entry.objectiveValue ?? 0)}`;
    else if (payload.objective.unit === 'USD')
      value = `about ${formatUsd(entry.objectiveValue ?? 0)} of material`;
    else value = `about ${formatNumber(entry.size.massKg ?? 0)} kg`;
    return `${entry.size.description}, ${value}`;
  }
  return `${formatNumber(entry.objectiveValue ?? 0)}% of the best performance index`;
}

// How the top pick wins, in everyday words.
function everydayWinReason(
  top: RankedEntry,
  payload: ExplanationPayload,
): string {
  if (payload.mode !== 'sizing' || !top.size)
    return 'scores highest on the performance index';
  if (payload.objective.unit === 'USD eq.')
    return `gives the best balance of cost, weight and carbon — a penalty of about ${formatUsd(top.objectiveValue ?? 0)}`;
  if (payload.objective.unit === 'USD')
    return `does it for the least money — about ${formatUsd(top.objectiveValue ?? 0)} of material`;
  return `does it with the least weight — about ${formatNumber(top.size.massKg ?? 0)} kg`;
}

export function mockExplanation(
  payload: ExplanationPayload,
  audience: Audience,
): string {
  const out: string[] = [];
  const [top, ...rest] = payload.ranked;
  const alternatives = rest.slice(0, 2);
  const whyNot = payload.ruledOut.slice(0, 3);

  if (!top) {
    out.push('## No material fits every requirement');
    out.push(
      `None of the ${payload.counts.considered} candidates met all of your requirements. Here is what ruled out some of them:`,
    );
    for (const ruledOut of payload.ruledOut.slice(0, 4))
      out.push(`- **${ruledOut.name}**: ${lowerFirst(ruledOut.reasons[0])}`);
    out.push(
      'Try relaxing the strictest requirement — usually the tool list, the environment or the budget — and run again.',
    );
  } else {
    out.push(audience === 'engineer' ? '## Recommendation' : '## Our pick');
    if (audience === 'craftsman') {
      out.push(`Go with **${nameWithGrade(top)}**. ${top.reasons[0]}.`);
    } else if (audience === 'everyday') {
      out.push(
        `The best choice is **${nameWithGrade(top)}**. Out of ${payload.counts.considered} materials we looked at, ${payload.counts.fit} can do the job, and this one ${everydayWinReason(top, payload)}.`,
      );
    } else if (payload.mode === 'sizing') {
      out.push(
        `**${nameWithGrade(top)}** ranks first on ${lowerFirst(payload.objective.label)} (${headline(top, payload)}).`,
      );
    } else {
      out.push(
        `**${nameWithGrade(top)}** scores highest on the material index ${payload.index.expression} — ${lowerFirst(payload.index.description)}.`,
      );
    }
    if (top.size) {
      const governedBy = top.size.governedBy;
      if (audience === 'craftsman')
        out.push(
          `## What to buy\n- **${top.size.description}**\n- About ${formatNumber(top.size.massKg ?? 0)} kg of material${top.size.materialCostUsd ? `, roughly ${formatUsd(top.size.materialCostUsd[0] ?? 0)}–${formatUsd(top.size.materialCostUsd[1] ?? 0)}` : ''}.\n- The size is set by ${governedBy}.`,
        );
      else if (audience === 'everyday')
        out.push(
          `You would need a **${top.size.description}**. What decides the size is ${governedBy} — think of it as the weakest link the part has to cope with.`,
        );
      else
        out.push(
          `Required section: ${top.size.description}; the size is governed by ${governedBy}.`,
        );
    }
    out.push(
      audience === 'everyday'
        ? `In ${top.chanceBestPercent}% of ${formatNumber(payload.monteCarloSamples)} "what if" runs (where each property was varied across its likely range) it came out on top.`
        : `It was the best choice in ${top.chanceBestPercent}% of ${formatNumber(payload.monteCarloSamples)} Monte Carlo runs and in the top 3 in ${top.chanceTop3Percent}%.`,
    );

    if (alternatives.length) {
      out.push('## Good alternatives');
      for (const alternative of alternatives)
        out.push(
          `- **${nameWithGrade(alternative)}** — ${alternative.size ? alternative.size.description + '; ' : ''}${lowerFirst(alternative.reasons[0])}.`,
        );
    }
    if (whyNot.length) {
      out.push(
        audience === 'everyday'
          ? '## Why not the usual suspects?'
          : '## Why not these?',
      );
      for (const ruledOut of whyNot)
        out.push(`- **${ruledOut.name}**: ${lowerFirst(ruledOut.reasons[0])}.`);
    }
    if (audience === 'craftsman') {
      out.push('## Working with it');
      const tools = Object.entries(top.tools)
        .map(([tool, rating]) => `${tool.replace('_', ' ')} (${rating})`)
        .join(', ');
      out.push(
        `${tools ? `With your tools: ${tools}. ` : ''}Measure twice and deburr or sand every cut edge. Pre-drill fixing holes and keep them away from the ends, and protect any cut or drilled surface with the finish the supplier recommends.`,
      );
    }
    if (audience === 'engineer') {
      const design = payload.design;
      out.push('## Method');
      out.push(
        design.component === 'custom'
          ? `- **Function:** ${design.function ?? 'general part'} The material is chosen by its properties, not by a load case.`
          : `- **Idealisation:** ${design.component}${payload.mode === 'sizing' && design.section ? `, ${design.section.replace(/_/g, ' ')} section` : ''}.`,
      );
      out.push(`- **Constraints:** ${payload.constraints.join('; ')}.`);
      out.push(
        payload.mode === 'sizing'
          ? `- **Safety factor:** ${formatNumber(payload.safetyFactor ?? 1)}, applied to strength and buckling; sizes use the weak end of each E and strength range.`
          : '- **Conservative scoring:** each material is scored at the end of its property ranges that makes the index worse.',
      );
      out.push(
        `- **Index:** ${payload.index.expression} — ${lowerFirst(payload.index.description)}.`,
      );
      out.push(
        `- **Uncertainty:** each property was sampled log-uniformly within its range (${formatNumber(payload.monteCarloSamples)} samples, independent). Read the chance of being best and the p10–p90 range together: a close race means either option is defensible.`,
      );
    }
  }

  out.push('## Please check');
  out.push(
    'Property values are AI-estimated typical ranges that vary by grade, supplier and processing — confirm them with the supplier datasheet before you buy.',
  );
  for (const note of payload.safetyNotes) out.push(`> ⚠️ **Safety:** ${note}`);
  return out.join('\n\n');
}
