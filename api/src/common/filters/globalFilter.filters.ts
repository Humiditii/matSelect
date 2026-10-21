import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ThrottlerException } from '@nestjs/throttler';
import { AppLoggerService } from '../logging/logging.service';

@Catch()
@Injectable()
export class AllGlobalExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLoggerService) {}

  catch(exception: any, host: ArgumentsHost) {
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    if (exception instanceof HttpException) {
      status = exception.getStatus();
    } else if (typeof exception?.getStatus === 'function') {
      status = exception.getStatus();
    } else if (typeof exception?.status === 'number') {
      status = exception.status;
    } else if (typeof exception?.statusCode === 'number') {
      status = exception.statusCode;
    }

    let message: string | string[] = 'Internal server error @ MatSelect Filter';
    let issues: { path: string; message: string }[] | undefined;

    if (exception instanceof ThrottlerException) {
      message = 'Too many requests — please wait a minute and try again.';
    } else if (exception instanceof HttpException) {
      const body: any = exception.getResponse();
      message =
        typeof body === 'object'
          ? body?.message || exception.message
          : body || exception.message;
      if (Array.isArray(body?.issues)) issues = body.issues;
    } else {
      message = exception?.message || exception?.response?.message || message;
    }

    // class-validator returns a list of messages: expose them as issues too.
    if (Array.isArray(message)) {
      issues =
        issues ?? message.map((m) => ({ path: m.split(' ')[0], message: m }));
      message = `Invalid request: ${message.join(', ')}`;
    }

    if (status >= 500) {
      this.logger.error(
        `MatSelect Filter: ${message}`,
        JSON.stringify(exception?.stack) || 'No stack trace available',
      );
    } else {
      this.logger.warn(`MatSelect Filter: ${status} ${message}`);
    }

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const finalStatus = typeof status === 'number' ? status : 500;

    response.status(finalStatus).json({
      message,
      error: finalStatus,
      ...(issues && { issues }),
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
