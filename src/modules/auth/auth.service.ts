import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { User } from '../../database/schema/users';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { UsersService } from '../users/users.service';
import { AuthResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { PasswordService } from './password.service';
import { SessionMeta, TokenService } from './token.service';
import { MESSAGES } from '../../common/messages';

/**
 * Credential verification and token issuing.
 *
 * Reads users through UsersService; it never touches the database itself.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
  ) {}

  async register(dto: RegisterDto, meta: SessionMeta): Promise<AuthResponseDto> {
    const passwordHash = await this.passwordService.hash(dto.password);

    // A duplicate email surfaces as a 409 from UsersService, driven by the
    // unique index rather than a pre-flight check that could race.
    const user = await this.usersService.create({
      email: dto.email,
      fullName: dto.fullName,
      phone: dto.phone,
      passwordHash,
    });

    return this.buildSession(user, meta);
  }

  /**
   * Every failure path — unknown email, wrong password, suspended account —
   * answers with the same 401 and takes roughly the same time, so the endpoint
   * can't be used to enumerate who has an account.
   */
  async login(dto: LoginDto, meta: SessionMeta): Promise<AuthResponseDto> {
    const user = await this.usersService.findByEmailForAuth(dto.email);

    if (!user) {
      await this.passwordService.verifyDecoy();
      throw new UnauthorizedException(MESSAGES.auth.invalidCredentials);
    }

    const passwordMatches = await this.passwordService.verify(user.passwordHash, dto.password);

    if (!passwordMatches) throw new UnauthorizedException(MESSAGES.auth.invalidCredentials);
    if (user.status !== 'active') {
      throw new UnauthorizedException(MESSAGES.auth.invalidCredentials);
    }

    return this.buildSession(user, meta);
  }

  /**
   * Trades a refresh token for a fresh pair. The presented token is burned in
   * the process, and the replacement stays in the same family so a replay of
   * the old one takes the whole lineage down.
   */
  async refresh(presentedToken: string, meta: SessionMeta): Promise<AuthResponseDto> {
    const { userId, familyId } = await this.tokenService.consumeRefreshToken(presentedToken);

    const user = await this.usersService.findById(userId);

    if (!user || user.status !== 'active') {
      // The account was suspended or deleted mid-session: drop every sibling
      // token rather than handing back a working pair.
      await this.tokenService.revokeAllForUser(userId);
      throw new ForbiddenException(MESSAGES.auth.accountInactive);
    }

    return this.buildSession(user, meta, familyId);
  }

  async logout(presentedToken: string): Promise<void> {
    await this.tokenService.revokeRefreshToken(presentedToken);
  }

  async logoutEverywhere(userId: string): Promise<void> {
    await this.tokenService.revokeAllForUser(userId);
  }

  /**
   * Signs an access token and mints a refresh token for `familyId`, defaulting
   * to a brand-new lineage (a fresh login rather than a rotation).
   */
  private async buildSession(
    user: User,
    meta: SessionMeta = {},
    familyId = this.tokenService.newFamilyId(),
  ): Promise<AuthResponseDto> {
    const [access, refreshToken] = await Promise.all([
      this.tokenService.signAccessToken(user),
      this.tokenService.issueRefreshToken(user.id, familyId, meta),
    ]);

    return {
      tokenType: 'Bearer',
      accessToken: access.token,
      refreshToken,
      expiresIn: access.expiresIn,
      user: UserResponseDto.from(user),
    };
  }
}
