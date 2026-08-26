import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'auth:isPublic';

/**
 * Opts a route out of the globally registered `JwtAuthGuard`.
 *
 * Authentication is on by default for every route in the app; this is the only
 * way to open one up, which makes unprotected endpoints greppable.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
