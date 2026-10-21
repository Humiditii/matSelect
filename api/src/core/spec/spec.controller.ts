import { Body, Controller, Headers, HttpCode, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { AppResponse } from 'src/common/appResponse.parser';
import { CONFIGS } from 'src/common/constants/configs.constant';
import { LlmService } from 'src/core/llm/llm.service';
import { ExtractSpecDto } from './dto/spec.dto';
import { SpecService } from './spec.service';
import { SwaggerExtractSpec } from './spec.swagger';

@Controller('specs')
export class SpecController {
  constructor(
    private readonly specService: SpecService,
    private readonly llm: LlmService,
  ) {}

  private success = AppResponse.success;

  @SwaggerExtractSpec()
  @Post('extract')
  @HttpCode(200)
  async extractSpec(
    @Res() res: Response,
    @Body() b: ExtractSpecDto,
    @Headers(CONFIGS.USER_KEY_HEADER) userKey?: string,
  ): Promise<Response> {
    const data = await this.specService.extractSpec(
      b,
      this.llm.resolve(userKey),
    );

    return res.status(200).json(this.success('success', 200, data));
  }
}
