import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

function isBodyParserError(e: unknown): e is { status: number; type: string } {
  return (
    typeof e === 'object' &&
    e !== null &&
    typeof (e as { type?: unknown }).type === 'string' &&
    (e as { type: string }).type.startsWith('entity.') &&
    typeof (e as { status?: unknown }).status === 'number'
  );
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = (request as any).requestId ?? 'unknown';

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred.';

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && 'message' in exceptionResponse) {
        const msg = (exceptionResponse as any).message;
        message = Array.isArray(msg) ? msg.join('; ') : msg;
      } else if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      }

      code = this.getErrorCode(statusCode);
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      statusCode = HttpStatus.CONFLICT;
      code = 'CONFLICT';

      if (exception.code === 'P2002') {
        message = 'A record with this value already exists.';
      } else if (exception.code === 'P2025') {
        statusCode = HttpStatus.NOT_FOUND;
        code = 'NOT_FOUND';
        message = 'The requested resource was not found.';
      } else {
        message = 'Database operation failed.';
      }
    } else if (isBodyParserError(exception)) {
      // Raised by express body-parser before reaching a controller (oversized or malformed JSON).
      statusCode = exception.status;
      code = statusCode === 413 ? 'PAYLOAD_TOO_LARGE' : 'VALIDATION_ERROR';
      message = statusCode === 413 ? 'Request body is too large.' : 'Malformed request body.';
    } else if (exception instanceof Error) {
      this.logger.error(`Unhandled error: ${exception.message}`, exception.stack);
    }

    response.status(statusCode).json({
      statusCode,
      code,
      message,
      requestId,
    });
  }

  private getErrorCode(status: HttpStatus): string {
    const codes: Record<number, string> = {
      400: 'VALIDATION_ERROR',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      413: 'PAYLOAD_TOO_LARGE',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'RATE_LIMITED',
      500: 'INTERNAL_ERROR',
    };
    return codes[status] ?? 'INTERNAL_ERROR';
  }
}
