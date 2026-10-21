'use client';

import type { Question } from '@/lib/types';
import { CustomEnvironmentInput } from '../CustomEnvironmentInput';
import { cx } from '../ui';

export function QuestionCard({
  question,
  answer,
  onAnswer,
  onOtherAnswer,
}: {
  question: Question;
  /** Label of the chosen option, if any. */
  answer: string | undefined;
  onAnswer: (label: string, value: unknown) => void;
  /** When set, the user can also type their own answer (used for environment questions). */
  onOtherAnswer?: (text: string) => void;
}) {
  return (
    <div
      className={cx(
        'animate-fade-in rounded-2xl border p-4 transition',
        answer ? 'border-emerald-200 bg-emerald-50/60' : 'border-brand-200 bg-brand-50/60',
      )}
    >
      <p className="flex items-start gap-2 font-medium text-slate-900">
        <span aria-hidden>{answer ? '✅' : '❓'}</span>
        {question.question}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {question.options.map((option) => (
          <button
            key={option.label}
            type="button"
            onClick={() => onAnswer(option.label, option.value)}
            className={cx(
              'rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset transition',
              answer === option.label
                ? 'bg-emerald-600 text-white ring-emerald-600'
                : 'bg-white text-slate-700 ring-slate-300 hover:ring-brand-400',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      {onOtherAnswer && <CustomEnvironmentInput compact values={[]} onChange={(added) => added[0] && onOtherAnswer(added[0])} />}
    </div>
  );
}
