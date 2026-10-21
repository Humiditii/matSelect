import { applyDecorators } from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SwaggerUserKeyHeader } from '../spec/spec.swagger';
import { FindSourcesDto } from './dto/sourcing.dto';

export function SwaggerFindSources() {
  return applyDecorators(
    ApiTags('Sourcing'),
    SwaggerUserKeyHeader(),
    ApiOperation({
      summary: 'Where to buy the top picks in a country',
      description:
        'With Claude: a live web search localised to the country (and city) finds suppliers, with links. Without a key: availability guidance and search links. Cached per country.',
    }),
    ApiParam({
      name: 'selectionId',
      required: true,
      description: 'selection id (UUID)',
    }),
    ApiBody({ type: FindSourcesDto }),
    ApiResponse({
      status: 200,
      description:
        'success — { country, countryName, items[], dataSource, note }',
    }),
    ApiResponse({ status: 404, description: 'No selection with that id' }),
    ApiResponse({
      status: 502,
      description: 'Claude or the web search failed',
    }),
  );
}
