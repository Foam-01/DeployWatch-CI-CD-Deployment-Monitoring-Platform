import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { API, createTestApp, resetDatabase, resetThrottling } from './helpers';

describe('Authentication (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    resetThrottling(app);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const register = (body: Record<string, unknown>) => http().post(`${API}/auth/register`).send(body);

  function refreshCookie(res: request.Response): string {
    const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    const cookie = cookies.find((c) => c.startsWith('dw_refresh='));
    if (!cookie) throw new Error('No refresh cookie set');
    return cookie;
  }

  it('TC-A01 registers a user, creates their workspace as OWNER, and returns no refresh token in the body', async () => {
    const res = await register({ name: 'Foam', email: 'Foam@Example.test', password: 'password-123' }).expect(201);

    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.refreshToken).toBeUndefined();
    expect(res.body.data.user.email).toBe('foam@example.test');

    const cookie = refreshCookie(res);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);

    const membership = await prisma.membership.findFirstOrThrow();
    expect(membership.role).toBe('OWNER');
  });

  it('TC-A02 never stores the plain password', async () => {
    await register({ name: 'Foam', email: 'foam@example.test', password: 'password-123' }).expect(201);
    const user = await prisma.user.findFirstOrThrow();
    expect(user.passwordHash).not.toContain('password-123');
    expect(user.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it.each([
    ['missing email', { name: 'A b', password: 'password-123' }],
    ['invalid email', { name: 'A b', email: 'not-an-email', password: 'password-123' }],
    ['short password', { name: 'A b', email: 'a@example.test', password: 'short' }],
    ['unknown field', { name: 'A b', email: 'a@example.test', password: 'password-123', role: 'OWNER' }],
  ])('TC-A03 rejects register with %s (400 VALIDATION_ERROR)', async (_label, body) => {
    const res = await register(body).expect(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.requestId).toBeDefined();
  });

  it('TC-A04 rejects a duplicate email regardless of case (409)', async () => {
    await register({ name: 'Foam', email: 'foam@example.test', password: 'password-123' }).expect(201);
    const res = await register({ name: 'Foam', email: 'FOAM@example.test', password: 'password-123' }).expect(409);
    expect(res.body.code).toBe('CONFLICT');
  });

  it('TC-A05 login with a wrong password and with an unknown email both return the same 401', async () => {
    await register({ name: 'Foam', email: 'foam@example.test', password: 'password-123' }).expect(201);

    const wrongPassword = await http()
      .post(`${API}/auth/login`)
      .send({ email: 'foam@example.test', password: 'wrong-password' })
      .expect(401);
    const unknownUser = await http()
      .post(`${API}/auth/login`)
      .send({ email: 'nobody@example.test', password: 'wrong-password' })
      .expect(401);

    // Same message so attackers cannot enumerate registered emails.
    expect(wrongPassword.body.message).toBe(unknownUser.body.message);
  });

  it('TC-A06 /auth/me requires a valid token', async () => {
    await http().get(`${API}/auth/me`).expect(401);
    await http().get(`${API}/auth/me`).set('Authorization', 'Bearer not-a-jwt').expect(401);
  });

  it('TC-A07 refresh cookie issues a new access token; logout clears the cookie', async () => {
    const reg = await register({ name: 'Foam', email: 'foam@example.test', password: 'password-123' }).expect(201);
    const cookie = refreshCookie(reg);

    const refreshed = await http().post(`${API}/auth/refresh`).set('Cookie', cookie).expect(200);
    await http()
      .get(`${API}/auth/me`)
      .set('Authorization', `Bearer ${refreshed.body.data.accessToken}`)
      .expect(200);

    const logout = await http().post(`${API}/auth/logout`).set('Cookie', cookie).expect(200);
    expect(([] as string[]).concat(logout.headers['set-cookie'] ?? []).join(';')).toMatch(/dw_refresh=;/);
  });

  it('TC-A08 refresh without a cookie or with a forged token is rejected', async () => {
    await http().post(`${API}/auth/refresh`).expect(401);
    await http().post(`${API}/auth/refresh`).set('Cookie', 'dw_refresh=forged.token.value').expect(401);
  });

  it('TC-A09 rate-limits repeated failed logins (brute force protection)', async () => {
    const attempts = Array.from({ length: 12 }, () =>
      http().post(`${API}/auth/login`).send({ email: 'victim@example.test', password: 'guess' }),
    );
    const statuses = (await Promise.all(attempts)).map((r) => r.status);
    expect(statuses).toContain(429);
  });
});
