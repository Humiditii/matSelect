import { PROCESS_LABEL, RATING_LEVEL_STYLE, formatRange } from '@/lib/labels';
import type { RankedMaterial } from '@/lib/types';
import { Badge } from '../ui';

const WORKABILITY_STYLE = {
  easy: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  moderate: 'bg-sky-50 text-sky-700 ring-sky-200',
  hard: 'bg-amber-50 text-amber-800 ring-amber-200',
} as const;

const GREEN_BADGE = 'bg-emerald-50 text-emerald-700 ring-emerald-200';

/** Carbon footprint, sustainability badges and "How to make it" for one ranked material. */
export function FootprintDetails({ material, hazards }: { material: RankedMaterial; hazards: string[] }) {
  const { footprint, sustainability, processability } = material;
  if (!footprint && !sustainability && !processability) return null;

  const showHowToMake = processability && (processability.level || processability.tips.length > 0 || hazards.length > 0);

  return (
    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
      {footprint?.co2Kg && (
        <div className="flex items-start gap-2 text-sm">
          <span aria-hidden>🌱</span>
          <div>
            <span className="font-medium text-slate-900">{formatRange(footprint.co2Kg, 2)} kg CO₂e</span>
            <span className="text-slate-500"> {footprint.basis === 'part' ? 'to make this part' : 'per kg of material'}</span>
            {footprint.energyMJ && (
              <span className="block text-xs text-slate-500">
                {formatRange(footprint.energyMJ, 2)} MJ embodied energy · typical virgin material, cradle to gate
              </span>
            )}
          </div>
        </div>
      )}
      {sustainability && (
        <div className="flex flex-wrap gap-1.5">
          {sustainability.recyclability && (
            <Badge
              className={RATING_LEVEL_STYLE[sustainability.recyclability]}
              title="How practical it is to recycle with today's infrastructure"
            >
              ♻️ recycling: {sustainability.recyclability}
            </Badge>
          )}
          {sustainability.renewable && <Badge className={GREEN_BADGE}>🌿 renewable</Badge>}
          {sustainability.biodegradable && <Badge className={GREEN_BADGE}>biodegradable</Badge>}
          {sustainability.criticalRawMaterials.map((element) => (
            <Badge
              key={element}
              className="bg-violet-50 text-violet-700 ring-violet-200"
              title="On the EU critical raw materials list (Regulation (EU) 2024/1252): supply risk"
            >
              ⚠ critical: {element}
            </Badge>
          ))}
        </div>
      )}
      {showHowToMake && (
        <details className="text-sm">
          <summary className="flex cursor-pointer select-none flex-wrap items-center gap-1.5 text-slate-700">
            🛠️ How to make it
            {processability.level && <Badge className={WORKABILITY_STYLE[processability.level]}>{processability.level} to work</Badge>}
          </summary>
          <div className="mt-2 space-y-1.5 text-slate-600">
            {processability.best.length > 0 && (
              <p className="text-xs">Good for: {processability.best.map((process) => PROCESS_LABEL[process].toLowerCase()).join(', ')}</p>
            )}
            {processability.tips.length > 0 && (
              <ul className="list-disc space-y-0.5 pl-5">
                {processability.tips.map((tip, i) => (
                  <li key={i}>{tip}</li>
                ))}
              </ul>
            )}
            {hazards.map((hazard, i) => (
              <p key={i} className="rounded-lg bg-rose-50 px-2 py-1 text-xs text-rose-800">
                ⚠️ {hazard}
              </p>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
