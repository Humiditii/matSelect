import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { AppResponse } from 'src/common/appResponse.parser';
import { CONFIGS } from 'src/common/constants/configs.constant';
import { LlmService } from 'src/core/llm/llm.service';
import { FindSourcesDto } from './dto/sourcing.dto';
import { SourcingService } from './sourcing.service';
import { SwaggerFindSources } from './sourcing.swagger';

@Controller('selections')
export class SourcingController {
  constructor(
    private readonly sourcingService: SourcingService,
    private readonly llm: LlmService,
  ) {}

  private success = AppResponse.success;

  @SwaggerFindSources()
  @Post(':selectionId/sourcing')
  @HttpCode(200)
  async findSources(
    @Res() res: Response,
    @Param('selectionId') selectionId: string,
    @Body() b: FindSourcesDto,
    @Headers(CONFIGS.USER_KEY_HEADER) userKey?: string,
  ): Promise<Response> {
    const data = await this.sourcingService.findSources(
      selectionId,
      b,
      this.llm.resolve(userKey),
    );

    return res.status(200).json(this.success('success', 200, data));
  }
}
