import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { SelectionModule } from '../selection/selection.module';
import { SourcingController } from './sourcing.controller';
import { SourcingService } from './sourcing.service';

@Module({
  controllers: [SourcingController],
  providers: [SourcingService],
  imports: [LlmModule, SelectionModule],
})
export class SourcingModule {}
