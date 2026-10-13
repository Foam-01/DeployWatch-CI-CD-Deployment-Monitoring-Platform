import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'info' },
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ],
    });
  }

  /**
   * Retries the initial connection: serverless Postgres (e.g. Neon) can take several
   * seconds to wake from suspend, and a container may start before the database.
   */
  async onModuleInit() {
    const maxAttempts = 5;
    for (let attempt = 1; ; attempt++) {
      try {
        await this.$connect();
        this.logger.log('Database connected');
        return;
      } catch (err) {
        if (attempt >= maxAttempts) throw err;
        const delayMs = 1000 * 2 ** (attempt - 1);
        this.logger.warn(`Database not reachable (attempt ${attempt}/${maxAttempts}); retrying in ${delayMs}ms`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Database disconnected');
  }

  async cleanDatabase() {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('cleanDatabase can only be called in test environment');
    }
    const tablenames = await this.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables WHERE schemaname='public'
    `;
    const tables = tablenames
      .map(({ tablename }) => tablename)
      .filter((name) => name !== '_prisma_migrations')
      .map((name) => `"public"."${name}"`)
      .join(', ');

    await this.$executeRawUnsafe(`TRUNCATE TABLE ${tables} CASCADE;`);
  }
}
