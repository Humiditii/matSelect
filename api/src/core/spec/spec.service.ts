import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { DesignSpec, ExtractResponse } from 'src/common/domain/domain.types';
import { LlmContextI } from 'src/common/interface/main.interface';
import { assertUnits } from 'src/common/util/spec.utils';
import { LlmService } from 'src/core/llm/llm.service';
import { mockExtract } from 'src/core/llm/mock/mock.data';
import {
  EXTRACTION_SCHEMA,
  ExtractionOutput,
} from 'src/core/llm/outputs/llm.outputs';
import {
  EXTRACTION_SYSTEM,
  extractionUser,
} from 'src/core/llm/prompts/llm.prompts';
import { ExtractSpecDto } from './dto/spec.dto';

@Injectable()
export class SpecService {
  constructor(private readonly llm: LlmService) {}

  /**
   * §6.1 — description → design brief. With a key, Claude does the translation; without one, the
   * built-in demo rules do. Claude's output must be schema-valid AND a valid DesignSpec with supported
   * units; validation errors are fed back for one corrective retry.
   */
  async extractSpec(
    p: ExtractSpecDto,
    ctx: LlmContextI,
  ): Promise<ExtractResponse> {
    const audience = p.audience ?? 'everyday';

    if (!this.llm.isLive(ctx)) {
      const { spec, questions } = mockExtract(p.text, audience);
      return { spec: DesignSpec.parse(spec), questions, dataSource: 'mock' };
    }

    const parse = ExtractionOutput.transform((o, zctx) => {
      const r = DesignSpec.safeParse({
        ...o.spec,
        audience,
        sourceText: p.text,
      });
      if (!r.success) {
        r.error.issues.forEach((i) =>
          zctx.addIssue({ ...i, path: ['spec', ...i.path] }),
        );
        return z.NEVER;
      }
      try {
        assertUnits(r.data);
      } catch (e) {
        zctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['spec'],
          message: (e as Error).message,
        });
        return z.NEVER;
      }
      return { spec: r.data, questions: o.questions };
    });

    const out = await this.llm.structured(ctx, {
      label: 'extraction',
      system: EXTRACTION_SYSTEM,
      user: (errors) => extractionUser(p.text, audience, errors),
      schema: EXTRACTION_SCHEMA,
      parse,
      maxTokens: 16000,
    });

    return { ...out, dataSource: 'llm' };
  }
}
