import { applyDecorators } from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CONFIGS } from 'src/common/constants/configs.constant';
import { ExtractSpecDto } from './dto/spec.dto';

export const SwaggerUserKeyHeader = () =>
  ApiHeader({
    name: CONFIGS.USER_KEY_HEADER,
    required: false,
    description:
      "The user's own LLM API key. Used only when the server has no key; never stored.",
  });

export function SwaggerExtractSpec() {
  return applyDecorators(
    ApiTags('Spec'),
    SwaggerUserKeyHeader(),
    ApiOperation({
      summary: 'Turn a description into a design brief',
      description:
        'The LLM (or the demo rules when no key is available) reads the description and returns the brief: function, goal, requirements, assumptions and at most two questions.',
    }),
    ApiBody({ type: ExtractSpecDto }),
    ApiResponse({
      status: 200,
      description: 'success — { spec, questions, dataSource }',
    }),
    ApiResponse({ status: 400, description: 'Invalid input data' }),
    ApiResponse({
      status: 401,
      description: "The user's own API key was rejected",
    }),
    ApiResponse({ status: 502, description: 'The LLM failed' }),
  );
}
