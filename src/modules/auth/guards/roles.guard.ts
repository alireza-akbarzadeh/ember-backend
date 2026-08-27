import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { UserRole } from '../../../database/schema/users';
import type { AuthenticatedUser } from '../auth.types';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { MESSAGES } from '../../../common/messages';

/**
 * Coarse role gate for routes carrying `@Roles()`. Registered after
 * `JwtAuthGuard`, so `request.user` is already populated.
 *
 * This is authentication's *second* check, not a substitute for ownership
 * rules — "may a courier read orders" belongs here, "may this courier read
 * *this* order" belongs in the service.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required?.length) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as AuthenticatedUser | undefined;

    // A @Roles() route that is also @Public() is a wiring mistake, not a
    // request the client can fix — fail closed and loudly.
    if (!user) throw new UnauthorizedException(MESSAGES.auth.required);

    if (!required.includes(user.role)) {
      throw new ForbiddenException(MESSAGES.auth.insufficientPermissions);
    }

    return true;
  }
}
