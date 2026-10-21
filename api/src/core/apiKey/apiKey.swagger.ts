import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { VerifyApiKeyDto } from './dto/apiKey.dto';

export function SwaggerVerifyApiKey() {
  return applyDecorators(
    ApiTags('API key'),
    ApiOperation({
      summary: "Check a user's own Claude API key",
      description:
        'Makes a free metadata call to Anthropic (no tokens). The key is not stored or logged.',
    }),
    ApiBody({ type: VerifyApiKeyDto }),
    ApiResponse({
      status: 200,
      description: 'success — { valid, model, message, serverHasKey }',
    }),
    ApiResponse({ status: 400, description: 'Invalid input data' }),
    ApiResponse({ status: 502, description: 'Could not reach Anthropic' }),
  );
}
