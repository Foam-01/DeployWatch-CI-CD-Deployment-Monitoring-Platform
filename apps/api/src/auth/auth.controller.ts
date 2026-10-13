import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/roles.decorator';

const REFRESH_COOKIE = 'dw_refresh';
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type TokenResult = Awaited<ReturnType<AuthService['login']>>;

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Throttle({ short: { limit: 10, ttl: 60_000 } })
  @Post('register')
  @ApiOperation({ summary: 'Register a new account' })
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    return this.withRefreshCookie(await this.authService.register(dto), res);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 5, ttl: 60_000 }, medium: { limit: 5, ttl: 60_000 }, long: { limit: 20, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Login with email and password' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    return this.withRefreshCookie(await this.authService.login(dto), res);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using the HttpOnly refresh cookie' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) throw new UnauthorizedException('No active session.');
    return this.withRefreshCookie(await this.authService.refreshTokens(token), res);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout and clear the refresh cookie' })
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
    return { data: { message: 'Logged out successfully.' } };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current authenticated user' })
  async me(@CurrentUser('sub') userId: string) {
    return this.authService.getMe(userId);
  }

  /** Moves the refresh token into an HttpOnly cookie so it is never exposed to JS. */
  private withRefreshCookie(result: TokenResult, res: Response) {
    const { refreshToken, ...rest } = result.data;
    res.cookie(REFRESH_COOKIE, refreshToken, {
      ...this.cookieOptions(),
      maxAge: REFRESH_COOKIE_MAX_AGE_MS,
    });
    return { data: rest };
  }

  private cookieOptions() {
    return {
      httpOnly: true,
      secure: this.configService.get('NODE_ENV') === 'production',
      sameSite: 'lax' as const,
      path: '/api/v1/auth',
    };
  }
}
