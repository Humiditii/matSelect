import { Injectable } from '@nestjs/common';
import { LlmService } from 'src/core/llm/llm.service';

@Injectable()
export class ApiKeyService {
  constructor(private readonly llm: LlmService) {}

  async verifyApiKey(apiKey: string) {
    const r = await this.llm.verifyKey(apiKey);
    return {
      ...r,
      serverHasKey: this.llm.hasServerKey,
      ...(this.llm.hasServerKey && {
        message: `${r.message} Note: this server already has its own key, so yours will not be used.`,
      }),
    };
  }
}
