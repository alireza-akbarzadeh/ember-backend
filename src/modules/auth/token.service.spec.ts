import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import type { RefreshToken } from '../../database/schema/refresh-tokens';
import { RefreshTokenRepository } from './refresh-token.repository';
import { TokenService } from './token.service';

const PRESENTED = 'a-refresh-token';
const PRESENTED_HASH = createHash('sha256').update(PRESENTED).digest('hex');

function storedToken(overrides: Partial<RefreshToken> = {}): RefreshToken {
  return {
    id: 'token-1',
    userId: 'user-1',
    familyId: 'family-1',
    tokenHash: PRESENTED_HASH,
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    userAgent: null,
    ipAddress: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('TokenService', () => {
  let service: TokenService;

  const repository = {
    insert: jest.fn(),
    findByHash: jest.fn(),
    markRevoked: jest.fn(),
    revokeFamily: jest.fn(),
    revokeAllForUser: jest.fn(),
    deleteExpired: jest.fn(),
  };

  const jwtService = {
    signAsync: jest.fn(),
    decode: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        TokenService,
        { provide: RefreshTokenRepository, useValue: repository },
        { provide: JwtService, useValue: jwtService },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(30) },
        },
      ],
    }).compile();

    service = module.get(TokenService);
  });

  describe('signAccessToken', () => {
    it('reports the remaining lifetime in seconds', async () => {
      const exp = Math.floor(Date.now() / 1000) + 900;
      jwtService.signAsync.mockResolvedValue('signed.jwt.value');
      jwtService.decode.mockReturnValue({ exp });

      const result = await service.signAccessToken({
        id: 'user-1',
        email: 'sam@example.com',
        role: 'customer',
      });

      expect(result.token).toBe('signed.jwt.value');
      expect(result.expiresIn).toBeGreaterThan(890);
      expect(result.expiresIn).toBeLessThanOrEqual(900);
    });

    it('signs only id, email and role', async () => {
      jwtService.signAsync.mockResolvedValue('signed.jwt.value');
      jwtService.decode.mockReturnValue({ exp: 0 });

      await service.signAccessToken({
        id: 'user-1',
        email: 'sam@example.com',
        role: 'admin',
      });

      expect(jwtService.signAsync).toHaveBeenCalledWith({
        sub: 'user-1',
        email: 'sam@example.com',
        role: 'admin',
      });
    });
  });

  describe('issueRefreshToken', () => {
    it('persists only the hash, never the token itself', async () => {
      repository.insert.mockResolvedValue(storedToken());

      const token = await service.issueRefreshToken('user-1', 'family-1', {
        userAgent: 'jest',
        ipAddress: '203.0.113.5',
      });

      const inserts = repository.insert.mock.calls as [{ tokenHash: string }][];
      const persisted = inserts[0][0];

      expect(persisted.tokenHash).toBe(createHash('sha256').update(token).digest('hex'));
      expect(JSON.stringify(persisted)).not.toContain(token);
    });

    it('mints a different token every call', async () => {
      repository.insert.mockResolvedValue(storedToken());

      const first = await service.issueRefreshToken('user-1', 'family-1', {});
      const second = await service.issueRefreshToken('user-1', 'family-1', {});

      expect(first).not.toBe(second);
    });
  });

  describe('consumeRefreshToken', () => {
    it('burns the token and returns its owner', async () => {
      repository.findByHash.mockResolvedValue(storedToken());
      repository.markRevoked.mockResolvedValue(true);

      await expect(service.consumeRefreshToken(PRESENTED)).resolves.toEqual({
        userId: 'user-1',
        familyId: 'family-1',
      });

      expect(repository.findByHash).toHaveBeenCalledWith(PRESENTED_HASH);
      expect(repository.markRevoked).toHaveBeenCalledWith('token-1');
    });

    it('rejects a token that was never issued', async () => {
      repository.findByHash.mockResolvedValue(null);

      await expect(service.consumeRefreshToken(PRESENTED)).rejects.toThrow(UnauthorizedException);
      expect(repository.revokeFamily).not.toHaveBeenCalled();
    });

    it('revokes the whole family when an already-rotated token is replayed', async () => {
      repository.findByHash.mockResolvedValue(storedToken({ revokedAt: new Date() }));

      await expect(service.consumeRefreshToken(PRESENTED)).rejects.toThrow(UnauthorizedException);
      expect(repository.revokeFamily).toHaveBeenCalledWith('family-1');
    });

    it('rejects an expired token without killing the family', async () => {
      repository.findByHash.mockResolvedValue(
        storedToken({ expiresAt: new Date(Date.now() - 1_000) }),
      );

      await expect(service.consumeRefreshToken(PRESENTED)).rejects.toThrow(UnauthorizedException);
      expect(repository.revokeFamily).not.toHaveBeenCalled();
    });

    it('treats losing the rotation race as a replay', async () => {
      repository.findByHash.mockResolvedValue(storedToken());
      // A concurrent request revoked it first.
      repository.markRevoked.mockResolvedValue(false);

      await expect(service.consumeRefreshToken(PRESENTED)).rejects.toThrow(UnauthorizedException);
      expect(repository.revokeFamily).toHaveBeenCalledWith('family-1');
    });

    it('gives the same message whatever the reason', async () => {
      const messages: string[] = [];

      repository.findByHash.mockResolvedValue(null);
      await service.consumeRefreshToken(PRESENTED).catch((error: Error) => {
        messages.push(error.message);
      });

      repository.findByHash.mockResolvedValue(storedToken({ revokedAt: new Date() }));
      await service.consumeRefreshToken(PRESENTED).catch((error: Error) => {
        messages.push(error.message);
      });

      repository.findByHash.mockResolvedValue(
        storedToken({ expiresAt: new Date(Date.now() - 1_000) }),
      );
      await service.consumeRefreshToken(PRESENTED).catch((error: Error) => {
        messages.push(error.message);
      });

      expect(messages).toHaveLength(3);
      expect(new Set(messages).size).toBe(1);
    });
  });

  describe('revokeRefreshToken', () => {
    it('revokes the family behind the presented token', async () => {
      repository.findByHash.mockResolvedValue(storedToken());

      await service.revokeRefreshToken(PRESENTED);

      expect(repository.revokeFamily).toHaveBeenCalledWith('family-1');
    });

    it('stays quiet when the token is unknown', async () => {
      repository.findByHash.mockResolvedValue(null);

      await expect(service.revokeRefreshToken(PRESENTED)).resolves.toBeUndefined();
      expect(repository.revokeFamily).not.toHaveBeenCalled();
    });
  });
});
