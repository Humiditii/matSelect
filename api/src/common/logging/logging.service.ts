import { Injectable, LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as winston from 'winston';
import DailyRotateFile = require('winston-daily-rotate-file');

@Injectable()
export class AppLoggerService implements LoggerService {
  private logger: winston.Logger;

  constructor(private readonly configService: ConfigService) {
    const isProduction = this.configService.get('NODE_ENV') === 'prod';
    // Hosts like Render only show console output (their disk is temporary), so allow console logs in prod.
    const logToConsole =
      !isProduction || this.configService.get('LOG_CONSOLE') === 'true';
    const serviceName =
      this.configService.get('SERVICE_NAME') || 'matselect-api';

    const dailyRotateFileTransport = new DailyRotateFile({
      filename: `logs/${serviceName}-%DATE%.log`,
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      level: 'info',
    });

    const consoleTransport = new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
      ),
    });

    this.logger = winston.createLogger({
      level: 'info',
      defaultMeta: { service: serviceName },
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message, service }) => {
          return `[${timestamp}] [${service}] ${level.toUpperCase()}: ${message}`;
        }),
      ),
      transports: [
        dailyRotateFileTransport,
        ...(logToConsole ? [consoleTransport] : []),
      ],
    });
  }

  log(message: string): void {
    this.logger.info(message);
  }

  error(message: string, trace?: string): void {
    this.logger.error(`${message} - Trace: ${trace}`);
  }

  warn(message: string): void {
    this.logger.warn(message);
  }

  debug?(message: string): void {
    this.logger.debug(message);
  }

  verbose?(message: string): void {
    this.logger.verbose(message);
  }
}
