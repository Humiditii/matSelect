import { Injectable } from '@nestjs/common';
import {
  Audience,
  DataSource,
  Explanation,
  SelectionResult,
} from 'src/common/domain/domain.types';
import { LlmContextI } from 'src/common/interface/main.interface';
import { AppLoggerService } from 'src/common/logging/logging.service';
import { LlmService } from 'src/core/llm/llm.service';
import { mockExplanation } from 'src/core/llm/mock/mock.explanation';
import {
  explanationSystem,
  explanationUser,
} from 'src/core/llm/prompts/llm.prompts';
import { buildPayload } from 'src/core/selection/util/explanationPayload.util';
import {
  checkGrounding,
  ignoreTermsFor,
} from 'src/core/selection/util/grounding.util';

@Injectable()
export class ExplanationService {
  constructor(
    private readonly llm: LlmService,
    private readonly logger: AppLoggerService,
  ) {}

  /**
   * Writes the explanation for one audience and checks that every number in it comes from the calculation,
   * regenerating once if some don't. If Claude fails, the calculation still stands and the templated
   * (grounded) summary is returned instead.
   */
  async generateExplanation(
    result: SelectionResult,
    audience: Audience,
    ctx: LlmContextI,
  ): Promise<Explanation> {
    const payload = buildPayload(result);
    const ignoreTerms = ignoreTermsFor(result);
    const checked = (text: string, source: DataSource): Explanation => ({
      audience,
      text,
      ...checkGrounding(text, payload, ignoreTerms),
      generatedAt: new Date().toISOString(),
      dataSource: source,
    });

    if (!this.llm.isLive(ctx))
      return checked(mockExplanation(payload, audience), 'mock');

    try {
      const system = explanationSystem(audience);
      const first = checked(
        await this.llm.text(
          ctx,
          `explanation:${audience}`,
          system,
          explanationUser(payload),
          8000,
        ),
        'llm',
      );
      if (first.grounded) return first;

      this.logger.warn(
        `ExplanationService: ${audience} explanation had unverified numbers ${first.unverifiedNumbers.join(', ')}; regenerating once.`,
      );
      const second = checked(
        await this.llm.text(
          ctx,
          `explanation:${audience}:retry`,
          system,
          explanationUser(payload, first.unverifiedNumbers),
          8000,
        ),
        'llm',
      );
      return second.unverifiedNumbers.length <= first.unverifiedNumbers.length
        ? second
        : first;
    } catch (err) {
      const reason = (err as Error).message;
      this.logger.error(
        `ExplanationService: explanation failed, using template: ${reason}`,
      );
      const fallback = checked(mockExplanation(payload, audience), 'mock');
      fallback.text = `> The LLM's explanation was unavailable (${reason}), so this is the standard summary.\n\n${fallback.text}`;
      return fallback;
    }
  }
}
