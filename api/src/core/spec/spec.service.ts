import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { DesignSpec, ExtractResponse } from 'src/common/domain/domain.types';
import { LlmContextI } from 'src/common/interface/main.interface';
import { assertUnits } from 'src/common/util/spec.utils';
import { LlmService } from 'src/core/llm/llm.service';
import { mockExtract } from 'src/core/llm/mock/mock.extraction';
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
   * Turns a description into a design brief. With a key Claude does the translation, otherwise the demo
   * rules do. Claude's answer must match the schema and also be a valid DesignSpec with supported units;
   * any errors are sent back for one corrective retry.
   */
  async extractSpec(
    request: ExtractSpecDto,
    ctx: LlmContextI,
  ): Promise<ExtractResponse> {
    const audience = request.audience ?? 'everyday';

    if (!this.llm.isLive(ctx)) {
      const { spec, questions } = mockExtract(request.text, audience);
      return { spec: DesignSpec.parse(spec), questions, dataSource: 'mock' };
    }

    const parse = ExtractionOutput.transform((output, zodCtx) => {
      const parsed = DesignSpec.safeParse({
        ...output.spec,
        audience,
        sourceText: request.text,
      });
      if (!parsed.success) {
        for (const issue of parsed.error.issues)
          zodCtx.addIssue({ ...issue, path: ['spec', ...issue.path] });
        return z.NEVER;
      }
      try {
        assertUnits(parsed.data);
      } catch (err) {
        zodCtx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['spec'],
          message: (err as Error).message,
        });
        return z.NEVER;
      }
      return { spec: parsed.data, questions: output.questions };
    });

    const extracted = await this.llm.structured(ctx, {
      label: 'extraction',
      system: EXTRACTION_SYSTEM,
      user: (errors) => extractionUser(request.text, audience, errors),
      schema: EXTRACTION_SCHEMA,
      parse,
      maxTokens: 16000,
    });

    return { ...extracted, dataSource: 'llm' };
  }
}
