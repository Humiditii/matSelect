'use client';

import { useState } from 'react';
import type { SelectionResult } from '@/lib/types';
import { Card, Segmented } from '../ui';
import { RankingChart } from './RankingChart';
import { TradeoffChart } from './TradeoffChart';

/** The "Compare visually" card: ranking bars and the trade-off chart behind one toggle. */
export function ChartsCard({ result, format }: { result: SelectionResult; format: (value: number) => string }) {
  const hasTradeoff = result.ranking.filter((material) => material.tradeoff).length >= 2;
  const [tab, setTab] = useState<'ranking' | 'tradeoff'>('ranking');
  if (result.ranking.length < 2) return null;

  const tabs = hasTradeoff ? (
    <Segmented
      value={tab}
      onChange={setTab}
      options={[
        { value: 'ranking', label: '📊 Ranking' },
        { value: 'tradeoff', label: '⚖️ Trade-off' },
      ]}
    />
  ) : undefined;

  return (
    <Card title="Compare visually" action={tabs}>
      {tab === 'tradeoff' && hasTradeoff ? <TradeoffChart result={result} /> : <RankingChart result={result} format={format} />}
    </Card>
  );
}
