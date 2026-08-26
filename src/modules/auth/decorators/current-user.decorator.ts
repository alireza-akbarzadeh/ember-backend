import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth.types';

/**
 * Reads the authenticated user off the request.
 *
 * `@CurrentUser() user` gives the whole object, `@CurrentUser('id') id` a
 * single field. Controllers must use this rather than digging through headers
 * or trusting an id from the request body.
 */
export const CurrentUser = createParamDecorator(
  (field: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const user = request.user as AuthenticatedUser | undefined;

    if (!user) return undefined;
    return field ? user[field] : user;
  },
);
