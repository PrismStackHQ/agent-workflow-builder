import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';
import pino from 'pino';

@Injectable()
export class LoggerService implements NestLoggerService {
  private readonly logger: pino.Logger;

  constructor(context?: string) {
    this.logger = pino({
      name: context || 'app',
      level: process.env.LOG_LEVEL || 'info',
      transport:
        process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    });
  }

  log(message: string, ...optionalParams: unknown[]) {
    this.logger.info({ args: optionalParams }, message);
  }

  error(message: string, ...optionalParams: unknown[]) {
    this.logger.error({ args: optionalParams }, message);
  }

  warn(message: string, ...optionalParams: unknown[]) {
    this.logger.warn({ args: optionalParams }, message);
  }

  debug(message: string, ...optionalParams: unknown[]) {
    this.logger.debug({ args: optionalParams }, message);
  }

  verbose(message: string, ...optionalParams: unknown[]) {
    this.logger.trace({ args: optionalParams }, message);
  }
}
