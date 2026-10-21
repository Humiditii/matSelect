import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { AppResponse } from 'src/common/appResponse.parser';
import { CONFIGS } from 'src/common/constants/configs.constant';
import { LlmService } from 'src/core/llm/llm.service';
import { CreateSelectionDto, ExplainSelectionDto } from './dto/selection.dto';
import { SelectionService } from './selection.service';
import {
  SwaggerCreateSelection,
  SwaggerExplainSelection,
  SwaggerFetchSelections,
  SwaggerGetSelectionById,
} from './selection.swagger';

@Controller('selections')
export class SelectionController {
  constructor(
    private readonly selectionService: SelectionService,
    private readonly llm: LlmService,
  ) {}

  private success = AppResponse.success;

  @SwaggerCreateSelection()
  @Post()
  async createSelection(
    @Res() res: Response,
    @Body() body: CreateSelectionDto,
    @Headers(CONFIGS.USER_KEY_HEADER) userKey?: string,
  ): Promise<Response> {
    const data = await this.selectionService.createSelection(
      body.spec,
      this.llm.resolve(userKey),
    );

    return res.status(201).json(this.success('success', 201, data));
  }

  @SwaggerFetchSelections()
  @SkipThrottle()
  @Get()
  async fetchSelections(@Res() res: Response): Promise<Response> {
    const data = await this.selectionService.getRecentSelections();

    return res.status(200).json(this.success('success', 200, data));
  }

  @SwaggerGetSelectionById()
  @SkipThrottle()
  @Get(':selectionId')
  async getSelectionById(
    @Res() res: Response,
    @Param('selectionId') selectionId: string,
  ): Promise<Response> {
    const data = await this.selectionService.getSelectionById(selectionId);

    return res.status(200).json(this.success('success', 200, data));
  }

  @SwaggerExplainSelection()
  @Post(':selectionId/explain')
  @HttpCode(200)
  async explainSelection(
    @Res() res: Response,
    @Param('selectionId') selectionId: string,
    @Body() body: ExplainSelectionDto,
    @Headers(CONFIGS.USER_KEY_HEADER) userKey?: string,
  ): Promise<Response> {
    const data = await this.selectionService.explainSelection(
      selectionId,
      body.audience,
      this.llm.resolve(userKey),
    );

    return res.status(200).json(this.success('success', 200, data));
  }
}
