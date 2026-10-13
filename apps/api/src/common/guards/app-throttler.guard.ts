import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Global rate limiter. Requests are tracked per client IP, except login attempts,
 * which are tracked per (IP, email) so one attacker cannot brute-force an account
 * while other users behind the same NAT can still sign in.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const isLogin = req.method === 'POST' && typeof req.path === 'string' && req.path.endsWith('/auth/login');
    if (!isLogin) return req.ip;
    const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : '';
    return `${req.ip}:login:${email}`;
  }
}
