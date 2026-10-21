import { Injectable } from '@nestjs/common';
import { LlmService } from 'src/core/llm/llm.service';

@Injectable()
export class ApiKeyService {
  constructor(private readonly llm: LlmService) {}

  async verifyApiKey(apiKey: string) {
    const check = await this.llm.verifyKey(apiKey);
    const serverHasKey = this.llm.hasServerKey;
    const message = serverHasKey
      ? `${check.message} Note: this server already has its own key, so yours will not be used.`
      : check.message;
    return { ...check, message, serverHasKey };
  }
}
