import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { NestApplicationOptions } from '@nestjs/common/interfaces/nest-application-options.interface';
import { ConfigService } from '@nestjs/config';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { RequestIdInterceptor } from './common/interceptors/request-id.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

// Prisma returns BigInt for provider IDs; serialize as string to keep precision.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

/** Max JSON body size. GitHub caps webhook payloads at 25 MB, but workflow_run events are far smaller. */
export const JSON_BODY_LIMIT = '1mb';

/**
 * Options passed to NestFactory.create — shared by main.ts and integration tests.
 * `rawBody` keeps the exact bytes GitHub signed; HMAC must be computed over them, not re-serialized JSON.
 */
export const APP_OPTIONS: NestApplicationOptions = { rawBody: true };

/**
 * Applies every global middleware, pipe, filter and interceptor.
 * Integration tests call this too, so they exercise the same HTTP stack as production.
 */
export function configureApp(app: NestExpressApplication): void {
  const configService = app.get(ConfigService);
  const corsOrigin = configService.get<string>('CORS_ORIGIN', 'http://localhost:3000');

  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  app.use(helmet());
  app.use(cookieParser());

  app.enableCors({
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  });

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new RequestIdInterceptor(), new LoggingInterceptor());
}
