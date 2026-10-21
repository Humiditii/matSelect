import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { ExplanationService } from './explanation.service';

@Module({
  providers: [ExplanationService],
  imports: [LlmModule],
  exports: [ExplanationService],
})
export class ExplanationModule {}
