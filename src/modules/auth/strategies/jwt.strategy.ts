import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../../users/users.service';
import type { AuthenticatedUser, JwtPayload } from '../auth.types';
import { MESSAGES } from '../../../common/messages';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      // Verified, not just decoded: a token minted for another service with
      // the same secret must not be accepted here.
      issuer: config.getOrThrow<string>('JWT_ISSUER'),
      audience: config.getOrThrow<string>('JWT_AUDIENCE'),
    });
  }

  /**
   * Runs on every authenticated request, after the signature checks out.
   *
   * The extra `findById` is a deliberate trade: one indexed primary-key lookup
   * per request buys immediate lockout for suspended or deleted accounts,
   * instead of leaving a valid token working until it expires. Swap it for a
   * short-TTL cache if it ever shows up in a profile.
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.usersService.findById(payload.sub);

    if (!user || user.status !== 'active') {
      throw new UnauthorizedException(MESSAGES.auth.accountInactive);
    }

    return { id: user.id, email: user.email, role: user.role };
  }
}
