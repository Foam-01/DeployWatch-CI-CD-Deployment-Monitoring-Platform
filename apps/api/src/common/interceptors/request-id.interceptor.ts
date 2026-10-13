import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Request, Response } from 'express';

@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const requestId =
      (request.headers['x-request-id'] as string) ||
      `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    (request as any).requestId = requestId;
    response.setHeader('X-Request-ID', requestId);

    return next.handle().pipe(
      map((data) => {
        // Wrap response with meta.requestId
        if (data && typeof data === 'object' && 'data' in data) {
          return {
            ...data,
            meta: { ...(data.meta || {}), requestId },
          };
        }
        return data;
      }),
    );
  }
}
