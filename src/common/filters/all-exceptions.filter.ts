import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { isUniqueViolation } from '../../database/database.errors';
import { MESSAGES } from '../messages';

/** Below this a failure is the client's fault and needs no stack trace. */
const SERVER_ERROR = 500;

/** Plain numbers, not HttpStatus: `status` is a number, and comparing it to
 * the enum trips `no-unsafe-enum-comparison`. */
const NOT_FOUND = 404;

/**
 * Last line of defence for error responses.
 *
 * Two jobs: make sure every failure is logged server-side with its real cause,
 * and make sure nothing but a sanitised body reaches the client. A raw driver
 * error carries table names, SQL fragments and sometimes column values — none
 * of which belong in an HTTP response.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, body } = this.describe(exception);

    const line = `${request.method} ${request.url} -> ${status}`;

    if (status >= SERVER_ERROR) {
      this.logger.error(line, exception instanceof Error ? exception.stack : String(exception));
    } else if (status === NOT_FOUND) {
      // Browsers probe for /favicon.ico, /robots.txt and friends on every page
      // load. Logging those at warn buries the 4xx that mean something.
      this.logger.debug(line);
    } else {
      this.logger.warn(line);
    }

    response.status(status).json({
      ...body,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }

  private describe(exception: unknown): {
    status: number;
    body: Record<string, unknown>;
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      return {
        status,
        body:
          typeof payload === 'string'
            ? { statusCode: status, message: payload }
            : { statusCode: status, ...(payload as Record<string, unknown>) },
      };
    }

    // A constraint the service layer didn't anticipate. Still a client
    // problem, so answer 409 rather than a misleading 500 — without echoing
    // which index was hit.
    if (isUniqueViolation(exception)) {
      return {
        status: HttpStatus.CONFLICT,
        body: {
          statusCode: HttpStatus.CONFLICT,
          message: MESSAGES.generic.conflict,
          error: 'Conflict',
        },
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: MESSAGES.generic.internal,
        error: 'Internal Server Error',
      },
    };
  }
}
