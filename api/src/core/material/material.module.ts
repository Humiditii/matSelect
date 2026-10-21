import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { MaterialService } from './material.service';

@Module({
  providers: [MaterialService],
  imports: [LlmModule],
  exports: [MaterialService],
})
export class MaterialModule {}
