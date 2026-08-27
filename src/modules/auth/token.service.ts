import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { User } from '../../database/schema/users';
import type { JwtPayload } from './auth.types';
import { RefreshTokenRepository } from './refresh-token.repository';
import { MESSAGES } from '../../common/messages';

/** Client fingerprint stored alongside a session, for audit and revocation UX. */
export interface SessionMeta {
  userAgent?: string;
  ipAddress?: string;
}

export interface AccessToken {
  token: string;
  expiresIn: number;
}

export interface ConsumedRefreshToken {
  userId: string;
  familyId: string;
}

/**
 * Token mechanics only — signing, minting, hashing and rotation bookkeeping.
 * It makes no decisions about *whether* a user may sign in; that is
 * `AuthService`'s job.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly refreshTokens: RefreshTokenRepository,
  ) {}

  /**
   * Short-lived, stateless bearer token. Claims are kept minimal: anything
   * bigger than id/email/role can go stale between refreshes.
   */
  async signAccessToken(user: Pick<User, 'id' | 'email' | 'role'>): Promise<AccessToken> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const token = await this.jwtService.signAsync(payload);
    const decoded = this.jwtService.decode<JwtPayload>(token);
    const expiresIn = decoded.exp ? decoded.exp - Math.floor(Date.now() / 1000) : 0;

    return { token, expiresIn };
  }

  /**
   * Mints an opaque refresh token and persists only its SHA-256.
   *
   * Opaque rather than a JWT so it is revocable: a stateless refresh JWT stays
   * valid until it expires no matter what the server decides.
   */
  async issueRefreshToken(userId: string, familyId: string, meta: SessionMeta): Promise<string> {
    const token = randomBytes(48).toString('base64url');
    const ttlDays = this.config.get<number>('REFRESH_TOKEN_TTL_DAYS', 30);

    await this.refreshTokens.insert({
      userId,
      familyId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000),
      userAgent: meta.userAgent?.slice(0, 512),
      ipAddress: meta.ipAddress,
    });

    return token;
  }

  /** Starts a new session lineage. Each login gets its own family. */
  newFamilyId(): string {
    return randomUUID();
  }

  /**
   * Validates and burns a refresh token, returning who it belonged to.
   *
   * Presenting a token that was already rotated means either a stolen token is
   * being replayed or the legitimate holder's token was stolen and used first.
   * Either way the lineage is untrustworthy, so the whole family is revoked and
   * every device on it has to sign in again.
   */
  async consumeRefreshToken(presented: string): Promise<ConsumedRefreshToken> {
    const stored = await this.refreshTokens.findByHash(hashToken(presented));

    // Same opaque message in every failure branch — an attacker learns nothing
    // about which check failed.
    if (!stored) throw new UnauthorizedException(MESSAGES.auth.invalidRefreshToken);

    if (stored.revokedAt) {
      await this.refreshTokens.revokeFamily(stored.familyId);
      throw new UnauthorizedException(MESSAGES.auth.invalidRefreshToken);
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException(MESSAGES.auth.invalidRefreshToken);
    }

    // Loses the race against a concurrent rotation => treat as a replay.
    const won = await this.refreshTokens.markRevoked(stored.id);
    if (!won) {
      await this.refreshTokens.revokeFamily(stored.familyId);
      throw new UnauthorizedException(MESSAGES.auth.invalidRefreshToken);
    }

    return { userId: stored.userId, familyId: stored.familyId };
  }

  /**
   * Logout. Revokes the whole family rather than the single token, so a
   * refresh already in flight on the same device can't resurrect the session.
   */
  async revokeRefreshToken(presented: string): Promise<void> {
    const stored = await this.refreshTokens.findByHash(hashToken(presented));
    if (stored) await this.refreshTokens.revokeFamily(stored.familyId);
  }

  /** Sign out everywhere — also the correct response to a password change. */
  revokeAllForUser(userId: string): Promise<void> {
    return this.refreshTokens.revokeAllForUser(userId);
  }
}

/**
 * Plain SHA-256 rather than argon2: the token is 48 bytes of CSPRNG output, so
 * there is no low-entropy guess for a slow hash to defend against, and refresh
 * happens on a hot path.
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
