import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { SpecController } from './spec.controller';
import { SpecService } from './spec.service';

@Module({
  controllers: [SpecController],
  providers: [SpecService],
  imports: [LlmModule],
})
export class SpecModule {}
