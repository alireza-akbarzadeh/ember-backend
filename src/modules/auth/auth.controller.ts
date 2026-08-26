import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { AuthResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import type { SessionMeta } from './token.service';

/**
 * Credential endpoints are rate limited far more tightly than the global
 * default: they are the ones worth brute-forcing.
 */
const CREDENTIAL_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle(CREDENTIAL_THROTTLE)
  @Post('register')
  @ApiOperation({ summary: 'Create an account and start a session' })
  @ApiCreatedResponse({ type: AuthResponseDto })
  register(@Body() dto: RegisterDto, @Req() request: Request): Promise<AuthResponseDto> {
    return this.authService.register(dto, sessionMeta(request));
  }

  @Public()
  @Throttle(CREDENTIAL_THROTTLE)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange credentials for a token pair' })
  @ApiOkResponse({ type: AuthResponseDto })
  login(@Body() dto: LoginDto, @Req() request: Request): Promise<AuthResponseDto> {
    return this.authService.login(dto, sessionMeta(request));
  }

  /**
   * Public because the refresh token *is* the credential — the caller has no
   * valid access token by the time they need this.
   */
  @Public()
  @Throttle(CREDENTIAL_THROTTLE)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate a refresh token for a new pair' })
  @ApiOkResponse({ type: AuthResponseDto })
  refresh(@Body() dto: RefreshTokenDto, @Req() request: Request): Promise<AuthResponseDto> {
    return this.authService.refresh(dto.refreshToken, sessionMeta(request));
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the session behind a refresh token' })
  logout(@Body() dto: RefreshTokenDto): Promise<void> {
    return this.authService.logout(dto.refreshToken);
  }

  @ApiBearerAuth()
  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke every session for the current user' })
  logoutEverywhere(@CurrentUser('id') userId: string): Promise<void> {
    return this.authService.logoutEverywhere(userId);
  }
}

/**
 * `request.ip` is only trustworthy when `trust proxy` matches the real number
 * of proxies in front of the app — see `TRUST_PROXY` in `main.ts`.
 */
function sessionMeta(request: Request): SessionMeta {
  return {
    userAgent: request.get('user-agent'),
    ipAddress: request.ip,
  };
}
