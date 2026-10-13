import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '../auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    const secret = configService.get<string>('JWT_SECRET');
    // Never fall back to a well-known secret: anyone could forge tokens with it.
    if (!secret) throw new Error('JWT_SECRET is required.');
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  /**
   * The signature and expiry are already verified, so the claims are trusted without a
   * database round trip on every request. Access tokens live 15 minutes, and OrgGuard
   * still loads the membership (and current role) from the database for org-scoped routes.
   */
  validate(payload: JwtPayload) {
    if (!payload?.sub) throw new UnauthorizedException('Invalid token.');
    return { id: payload.sub, sub: payload.sub, email: payload.email, name: payload.name };
  }
}
