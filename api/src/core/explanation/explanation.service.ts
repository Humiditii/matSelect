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
import { mockExplanation } from 'src/core/llm/mock/mock.data';
import {
  explanationSystem,
  explanationUser,
} from 'src/core/llm/prompts/llm.prompts';
import {
  buildPayload,
  checkGrounding,
  ignoreTermsFor,
} from 'src/core/selection/util/grounding.util';

@Injectable()
export class ExplanationService {
  constructor(
    private readonly llm: LlmService,
    private readonly logger: AppLoggerService,
  ) { }

  /**
   * explanation for one audience, then the grounding check (every number must come from the
   * calculation). Regenerates once if numbers don't match. If Claude fails, the calculation still stands:
   * the standard templated (and grounded) summary is returned instead.
   */
  async generateExplanation(
    result: SelectionResult,
    audience: Audience,
    ctx: LlmContextI,
  ): Promise<Explanation> {
    const payload = buildPayload(result);
    const ignore = ignoreTermsFor(result);
    const done = (text: string, source: DataSource): Explanation => {
      const g = checkGrounding(text, payload, ignore);
      return {
        audience,
        text,
        ...g,
        generatedAt: new Date().toISOString(),
        dataSource: source,
      };
    };

    if (!this.llm.isLive(ctx))
      return done(mockExplanation(payload, audience), 'mock');

    try {
      const system = explanationSystem(audience);
      let text = await this.llm.text(
        ctx,
        `explanation:${audience}`,
        system,
        explanationUser(payload),
        8000,
      );
      let g = checkGrounding(text, payload, ignore);

      if (!g.grounded) {
        this.logger.warn(
          `ExplanationService: ${audience} explanation had unverified numbers ${g.unverifiedNumbers.join(', ')}; regenerating once.`,
        );
        const second = await this.llm.text(
          ctx,
          `explanation:${audience}:retry`,
          system,
          explanationUser(payload, g.unverifiedNumbers),
          8000,
        );
        const g2 = checkGrounding(second, payload, ignore);
        if (g2.unverifiedNumbers.length <= g.unverifiedNumbers.length) {
          text = second;
          g = g2;
        }
      }

      return {
        audience,
        text,
        ...g,
        generatedAt: new Date().toISOString(),
        dataSource: 'llm',
      };
    } catch (e) {
      this.logger.error(
        `ExplanationService: explanation failed, using template: ${(e as Error).message}`,
      );
      const ex = done(mockExplanation(payload, audience), 'mock');
      ex.text = `> Claude's explanation was unavailable (${(e as Error).message}), so this is the standard summary.\n\n${ex.text}`;
      return ex;
    }
  }
}
