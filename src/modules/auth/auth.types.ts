import type { UserRole } from '../../database/schema/users';

/** What a verified access token resolves to, attached to `request.user`. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
}

/** Claims carried by the access token. `sub` is the user id. */
export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
}

/** Issued a pair. The refresh token is opaque — only its hash is persisted. */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}
