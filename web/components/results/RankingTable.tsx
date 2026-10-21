import { FAMILY_LABEL, formatPercent, materialName } from '@/lib/labels';
import type { SelectionResult } from '@/lib/types';
import { Card } from '../ui';
import { formatObjective, objectiveName } from './objective';

export function RankingTable({ result }: { result: SelectionResult }) {
  const isSized = result.mode === 'sizing';
  return (
    <Card title="All materials that fit" subtitle={`${result.ranking.length} materials, best first`}>
      <div className="-mx-4 overflow-x-auto sm:-mx-6">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 sm:pl-6">#</th>
              <th className="px-3 py-2">Material</th>
              <th className="px-3 py-2">{objectiveName(result).short}</th>
              <th className="px-3 py-2">Likely (p10–p90)</th>
              {isSized && <th className="px-3 py-2">Size</th>}
              <th className="px-3 py-2 sm:pr-6">Best / top 3</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {result.ranking.map((material) => (
              <tr key={material.materialId} className="hover:bg-slate-50">
                <td className="px-4 py-2 font-semibold text-slate-500 sm:pl-6">{material.rank}</td>
                <td className="px-3 py-2">
                  <div className="font-medium text-slate-900">{materialName(material)}</div>
                  <div className="text-xs text-slate-500">{FAMILY_LABEL[material.family].label}</div>
                </td>
                <td className="whitespace-nowrap px-3 py-2 font-semibold">{formatObjective(result, material.objectiveValue)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                  {formatObjective(result, material.objectiveInterval[0])}–{formatObjective(result, material.objectiveInterval[1])}
                </td>
                {isSized && <td className="min-w-48 px-3 py-2 text-slate-600">{material.sizing?.dimension}</td>}
                <td className="whitespace-nowrap px-3 py-2 text-slate-600 sm:pr-6">
                  {formatPercent(material.pBest)} / {formatPercent(material.pTop3)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
