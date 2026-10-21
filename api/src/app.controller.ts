import { Controller, Get, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { AppResponse } from './common/appResponse.parser';
import { AppService } from './app.service';

@SkipThrottle()
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  private success = AppResponse.success;

  @ApiTags('App')
  @ApiOperation({
    summary:
      'Service status: Claude mode, whether user keys are accepted, database',
  })
  @ApiResponse({ status: 200, description: 'success' })
  @Get('health')
  getHealth(@Res() res: Response): Response {
    return res
      .status(200)
      .json(this.success('success', 200, this.appService.getHealth()));
  }

  @ApiTags('App')
  @ApiOperation({
    summary: 'All enumerations, units and default safety factors (for forms)',
  })
  @ApiResponse({ status: 200, description: 'success' })
  @Get('meta')
  getMeta(@Res() res: Response): Response {
    return res
      .status(200)
      .json(this.success('success', 200, this.appService.getMeta()));
  }
}
