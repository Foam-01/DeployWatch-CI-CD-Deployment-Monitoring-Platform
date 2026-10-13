// Integration tests run against a disposable Postgres, never the developer's real database.
// Start one with: docker compose -f docker-compose.test.yml up -d
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://test:test@localhost:5433/deploywatch_test';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= 'test_jwt_secret';
process.env.JWT_REFRESH_SECRET ??= 'test_jwt_refresh_secret';
