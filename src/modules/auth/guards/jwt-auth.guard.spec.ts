import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';

const context = {
  getHandler: () => () => undefined,
  getClass: () => class {},
} as unknown as ExecutionContext;

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new JwtAuthGuard(reflector);
  });

  it('short-circuits a @Public() route without consulting Passport', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

    expect(guard.canActivate(context)).toBe(true);
  });

  describe('handleRequest', () => {
    it('returns the user when authentication succeeded', () => {
      const user = { id: 'user-1' };

      expect(guard.handleRequest(null, user, null)).toBe(user);
    });

    it('distinguishes an expired token so clients know to refresh', () => {
      const expired = new Error('jwt expired');
      expired.name = 'TokenExpiredError';

      expect(() => guard.handleRequest(null, false, expired)).toThrow('Access token expired');
    });

    it('stays vague about any other failure', () => {
      const malformed = new Error('jwt malformed');
      malformed.name = 'JsonWebTokenError';

      expect(() => guard.handleRequest(null, false, malformed)).toThrow('Authentication required');
    });

    it('rejects a missing token', () => {
      expect(() => guard.handleRequest(null, undefined, null)).toThrow(UnauthorizedException);
    });
  });
});
