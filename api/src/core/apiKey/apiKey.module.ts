import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { ApiKeyController } from './apiKey.controller';
import { ApiKeyService } from './apiKey.service';

@Module({
  controllers: [ApiKeyController],
  providers: [ApiKeyService],
  imports: [LlmModule],
})
export class ApiKeyModule {}
