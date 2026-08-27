import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Observable } from 'rxjs';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { MESSAGES } from '../../../common/messages';

/**
 * Registered globally in `AppModule`, so **every route is protected by
 * default** and a new controller cannot ship unauthenticated by omission.
 * `@Public()` is the single, greppable escape hatch.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    return super.canActivate(context);
  }

  /**
   * Turns Passport's failure info into a clean 401. Expiry is called out
   * separately so clients know to refresh rather than to re-prompt for a
   * password; everything else stays deliberately vague.
   */
  handleRequest<TUser>(err: unknown, user: unknown, info: unknown): TUser {
    if (err) {
      throw err instanceof Error ? err : new UnauthorizedException(MESSAGES.auth.required);
    }

    if (!user) {
      const reason =
        info instanceof Error && info.name === 'TokenExpiredError'
          ? MESSAGES.auth.accessTokenExpired
          : MESSAGES.auth.required;
      throw new UnauthorizedException(reason);
    }

    return user as TUser;
  }
}
