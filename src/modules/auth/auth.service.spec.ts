import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { User } from '../../database/schema/users';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

function aUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'sam@example.com',
    phone: null,
    fullName: 'Sam Rivera',
    passwordHash: '$argon2id$stored-hash',
    role: 'customer',
    status: 'active',
    emailVerifiedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('AuthService', () => {
  let service: AuthService;

  const usersService = {
    create: jest.fn(),
    findByEmailForAuth: jest.fn(),
    findById: jest.fn(),
  };

  const passwordService = {
    hash: jest.fn(),
    verify: jest.fn(),
    verifyDecoy: jest.fn(),
  };

  const tokenService = {
    signAccessToken: jest.fn(),
    issueRefreshToken: jest.fn(),
    newFamilyId: jest.fn(),
    consumeRefreshToken: jest.fn(),
    revokeRefreshToken: jest.fn(),
    revokeAllForUser: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    tokenService.signAccessToken.mockResolvedValue({
      token: 'access.jwt',
      expiresIn: 900,
    });
    tokenService.issueRefreshToken.mockResolvedValue('refresh-token');
    tokenService.newFamilyId.mockReturnValue('family-new');

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: PasswordService, useValue: passwordService },
        { provide: TokenService, useValue: tokenService },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('register', () => {
    it('stores a hash, never the plaintext password', async () => {
      passwordService.hash.mockResolvedValue('$argon2id$fresh-hash');
      usersService.create.mockResolvedValue(aUser());

      await service.register(
        {
          email: 'sam@example.com',
          password: 'correct horse battery',
          fullName: 'Sam Rivera',
        },
        {},
      );

      expect(passwordService.hash).toHaveBeenCalledWith('correct horse battery');

      const creates = usersService.create.mock.calls as [Record<string, unknown>][];
      const created = creates[0][0];

      expect(created.passwordHash).toBe('$argon2id$fresh-hash');
      expect(JSON.stringify(created)).not.toContain('correct horse battery');
    });

    it('never leaks the password hash into the response', async () => {
      passwordService.hash.mockResolvedValue('$argon2id$fresh-hash');
      usersService.create.mockResolvedValue(aUser());

      const result = await service.register(
        {
          email: 'sam@example.com',
          password: 'correct horse battery',
          fullName: 'Sam Rivera',
        },
        {},
      );

      expect(result.user).not.toHaveProperty('passwordHash');
      expect(JSON.stringify(result)).not.toContain('stored-hash');
    });

    it('starts a fresh token family', async () => {
      passwordService.hash.mockResolvedValue('$argon2id$fresh-hash');
      usersService.create.mockResolvedValue(aUser());

      await service.register(
        {
          email: 'sam@example.com',
          password: 'correct horse battery',
          fullName: 'Sam Rivera',
        },
        { ipAddress: '203.0.113.5' },
      );

      expect(tokenService.issueRefreshToken).toHaveBeenCalledWith('user-1', 'family-new', {
        ipAddress: '203.0.113.5',
      });
    });
  });

  describe('login', () => {
    const credentials = {
      email: 'sam@example.com',
      password: 'correct horse battery',
    };

    it('returns a token pair for valid credentials', async () => {
      usersService.findByEmailForAuth.mockResolvedValue(aUser());
      passwordService.verify.mockResolvedValue(true);

      const result = await service.login(credentials, {});

      expect(result).toMatchObject({
        tokenType: 'Bearer',
        accessToken: 'access.jwt',
        refreshToken: 'refresh-token',
        expiresIn: 900,
      });
      expect(result.user.id).toBe('user-1');
    });

    it('still hashes when the email is unknown, so timing does not leak', async () => {
      usersService.findByEmailForAuth.mockResolvedValue(null);

      await expect(service.login(credentials, {})).rejects.toThrow(UnauthorizedException);
      expect(passwordService.verifyDecoy).toHaveBeenCalled();
    });

    it('rejects a wrong password', async () => {
      usersService.findByEmailForAuth.mockResolvedValue(aUser());
      passwordService.verify.mockResolvedValue(false);

      await expect(service.login(credentials, {})).rejects.toThrow(UnauthorizedException);
      expect(tokenService.issueRefreshToken).not.toHaveBeenCalled();
    });

    it('rejects a suspended account', async () => {
      usersService.findByEmailForAuth.mockResolvedValue(aUser({ status: 'suspended' }));
      passwordService.verify.mockResolvedValue(true);

      await expect(service.login(credentials, {})).rejects.toThrow(UnauthorizedException);
      expect(tokenService.issueRefreshToken).not.toHaveBeenCalled();
    });

    it('cannot be used to tell registered emails from unregistered ones', async () => {
      const messages: string[] = [];

      usersService.findByEmailForAuth.mockResolvedValue(null);
      await service.login(credentials, {}).catch((error: Error) => {
        messages.push(error.message);
      });

      usersService.findByEmailForAuth.mockResolvedValue(aUser());
      passwordService.verify.mockResolvedValue(false);
      await service.login(credentials, {}).catch((error: Error) => {
        messages.push(error.message);
      });

      usersService.findByEmailForAuth.mockResolvedValue(aUser({ status: 'suspended' }));
      passwordService.verify.mockResolvedValue(true);
      await service.login(credentials, {}).catch((error: Error) => {
        messages.push(error.message);
      });

      expect(messages).toHaveLength(3);
      expect(new Set(messages).size).toBe(1);
    });
  });

  describe('refresh', () => {
    it('keeps the replacement token in the same family', async () => {
      tokenService.consumeRefreshToken.mockResolvedValue({
        userId: 'user-1',
        familyId: 'family-1',
      });
      usersService.findById.mockResolvedValue(aUser());

      await service.refresh('old-token', { ipAddress: '203.0.113.5' });

      expect(tokenService.issueRefreshToken).toHaveBeenCalledWith('user-1', 'family-1', {
        ipAddress: '203.0.113.5',
      });
      expect(tokenService.newFamilyId).not.toHaveBeenCalled();
    });

    it('cuts every session when the account is no longer active', async () => {
      tokenService.consumeRefreshToken.mockResolvedValue({
        userId: 'user-1',
        familyId: 'family-1',
      });
      usersService.findById.mockResolvedValue(aUser({ status: 'suspended' }));

      await expect(service.refresh('old-token', {})).rejects.toThrow(ForbiddenException);
      expect(tokenService.revokeAllForUser).toHaveBeenCalledWith('user-1');
      expect(tokenService.issueRefreshToken).not.toHaveBeenCalled();
    });

    it('cuts every session when the account was deleted mid-session', async () => {
      tokenService.consumeRefreshToken.mockResolvedValue({
        userId: 'user-1',
        familyId: 'family-1',
      });
      usersService.findById.mockResolvedValue(null);

      await expect(service.refresh('old-token', {})).rejects.toThrow(ForbiddenException);
      expect(tokenService.revokeAllForUser).toHaveBeenCalledWith('user-1');
    });
  });
});
