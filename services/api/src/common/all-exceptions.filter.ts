import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';

import { DomainError, type ErrorCode } from './domain-error';

// One error shape for every failure: { error: { code, message, details? } }.
// Unknown errors are logged in full and answered with a generic message, never with internals.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Http');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof DomainError) {
      response.status(exception.status).json({
        error: { code: exception.code, message: exception.message, details: exception.details },
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code: ErrorCode =
        status === 401 ? 'UNAUTHORIZED' : status === 404 ? 'NOT_FOUND' : status === 429 ? 'TOO_MANY_REQUESTS' : 'INVALID_REQUEST';
      response.status(status).json({ error: { code, message: exception.message } });
      return;
    }

    this.logger.error(exception instanceof Error ? (exception.stack ?? exception.message) : String(exception));
    response.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' } });
  }
}
