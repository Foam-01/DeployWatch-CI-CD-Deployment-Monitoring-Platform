import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import './app.setup'; // BigInt JSON serialization
import { AppModule } from './app.module';

/**
 * Background worker: runs schedulers (webhook retries, health checks) without an
 * HTTP server. Deploy one replica alongside API processes started with PROCESS_ROLE=api.
 * Multiple worker replicas are safe: webhook claims use FOR UPDATE SKIP LOCKED.
 */
async function bootstrap() {
  process.env.PROCESS_ROLE = 'worker';
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });
  app.enableShutdownHooks();
  new Logger('Worker').log('DeployWatch worker started (webhook retries, health checks).');
}

bootstrap();
