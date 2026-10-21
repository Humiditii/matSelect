import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { AppLoggerService } from '../logging/logging.service';

// Logs method, URL, status, size and time of every request. Headers are never logged: they may carry an API key.
@Injectable()
export class HttpLogger implements NestMiddleware {
  constructor(private readonly logger: AppLoggerService) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const startAt = process.hrtime();
    const { ip, method, originalUrl } = request;

    response.on('finish', () => {
      const { statusCode } = response;
      const contentLength = response.get('content-length') ?? 0;
      const diff = process.hrtime(startAt);
      const responseTime = (diff[0] * 1e3 + diff[1] * 1e-6).toFixed(0);
      this.logger.log(
        `${method} ${originalUrl} ${statusCode} ${contentLength}b ${responseTime}ms - ${ip}`,
      );
    });

    next();
  }
}
