// Integration tests run against a disposable Postgres, never the developer's real database.
// Start one with: docker compose -f docker-compose.test.yml up -d
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://test:test@localhost:5433/deploywatch_test';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= 'test_jwt_secret';
process.env.JWT_REFRESH_SECRET ??= 'test_jwt_refresh_secret';
// Fixed, publicly known key — test data only.
process.env.ENCRYPTION_KEY = '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
process.env.PROCESS_ROLE = 'all';
