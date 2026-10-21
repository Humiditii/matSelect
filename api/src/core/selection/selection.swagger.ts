import { applyDecorators } from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SwaggerUserKeyHeader } from '../spec/spec.swagger';
import { CreateSelectionDto, ExplainSelectionDto } from './dto/selection.dto';

export function SwaggerCreateSelection() {
  return applyDecorators(
    ApiTags('Selection'),
    SwaggerUserKeyHeader(),
    ApiOperation({
      summary: 'Run a material selection',
      description:
        'Gets candidates (LLM: 6 parallel calls; demo: built-in set), screens, sizes/scores, runs the Monte Carlo, ranks, writes the explanation for spec.audience and saves the result. 30–90 s with the LLM.',
    }),
    ApiBody({ type: CreateSelectionDto }),
    ApiResponse({
      status: 201,
      description: 'success — the full SelectionResult',
    }),
    ApiResponse({
      status: 400,
      description: 'Invalid brief or unknown unit (issues listed)',
    }),
    ApiResponse({
      status: 401,
      description: "The user's own API key was rejected",
    }),
    ApiResponse({
      status: 502,
      description: 'The LLM could not supply candidates for any family',
    }),
  );
}

export function SwaggerFetchSelections() {
  return applyDecorators(
    ApiTags('Selection'),
    ApiOperation({ summary: 'Recent selections (newest first)' }),
    ApiResponse({
      status: 200,
      description: 'success — [{ id, createdAt, title, topPick, candidates }]',
    }),
  );
}

export function SwaggerGetSelectionById() {
  return applyDecorators(
    ApiTags('Selection'),
    ApiOperation({ summary: 'One selection result' }),
    ApiParam({
      name: 'selectionId',
      required: true,
      description: 'selection id (UUID)',
    }),
    ApiResponse({
      status: 200,
      description: 'success — the full SelectionResult',
    }),
    ApiResponse({ status: 404, description: 'No selection with that id' }),
  );
}

export function SwaggerExplainSelection() {
  return applyDecorators(
    ApiTags('Selection'),
    SwaggerUserKeyHeader(),
    ApiOperation({
      summary: 'Explanation for another audience (generated once, then cached)',
    }),
    ApiParam({
      name: 'selectionId',
      required: true,
      description: 'selection id (UUID)',
    }),
    ApiBody({ type: ExplainSelectionDto }),
    ApiResponse({
      status: 200,
      description:
        'success — { audience, text, grounded, unverifiedNumbers, … }',
    }),
    ApiResponse({ status: 404, description: 'No selection with that id' }),
  );
}
