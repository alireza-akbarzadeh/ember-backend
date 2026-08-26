import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '../../../database/schema/users';
import type { AuthenticatedUser } from '../auth.types';
import { RolesGuard } from './roles.guard';

function contextWith(user?: AuthenticatedUser): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  const customer: AuthenticatedUser = {
    id: 'user-1',
    email: 'sam@example.com',
    role: 'customer',
  };

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  function requireRoles(roles: UserRole[] | undefined) {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(roles as unknown as UserRole[]);
  }

  it('lets a route through when it declares no roles', () => {
    requireRoles(undefined);

    expect(guard.canActivate(contextWith(customer))).toBe(true);
  });

  it('lets a route through when @Roles() is empty', () => {
    requireRoles([]);

    expect(guard.canActivate(contextWith(customer))).toBe(true);
  });

  it('allows a matching role', () => {
    requireRoles(['customer', 'admin']);

    expect(guard.canActivate(contextWith(customer))).toBe(true);
  });

  it('rejects a role that is not listed', () => {
    requireRoles(['admin']);

    expect(() => guard.canActivate(contextWith(customer))).toThrow(ForbiddenException);
  });

  it('fails closed when the route is role-gated but nobody is authenticated', () => {
    requireRoles(['admin']);

    expect(() => guard.canActivate(contextWith(undefined))).toThrow(UnauthorizedException);
  });
});
