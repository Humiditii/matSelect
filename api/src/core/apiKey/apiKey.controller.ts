import { Body, Controller, HttpCode, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { AppResponse } from 'src/common/appResponse.parser';
import { ApiKeyService } from './apiKey.service';
import { SwaggerVerifyApiKey } from './apiKey.swagger';
import { VerifyApiKeyDto } from './dto/apiKey.dto';

@Controller('api-key')
export class ApiKeyController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  private success = AppResponse.success;

  @SwaggerVerifyApiKey()
  @Post('verify')
  @HttpCode(200)
  async verifyApiKey(
    @Res() res: Response,
    @Body() body: VerifyApiKeyDto,
  ): Promise<Response> {
    const data = await this.apiKeyService.verifyApiKey(body.apiKey);

    return res.status(200).json(this.success('success', 200, data));
  }
}
