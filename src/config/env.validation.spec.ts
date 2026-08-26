import { validateEnv } from './env.validation';

const SECRET = 'a'.repeat(32);

/** The minimum that boots: the only two fields without a default. */
const MINIMAL = {
  DATABASE_URL: 'postgresql://user:pass@host/db?sslmode=require',
  JWT_ACCESS_SECRET: SECRET,
};

describe('validateEnv', () => {
  describe('required fields', () => {
    it('accepts the minimal environment', () => {
      expect(() => validateEnv({ ...MINIMAL })).not.toThrow();
    });

    it('names the missing variable rather than failing vaguely', () => {
      expect(() => validateEnv({ DATABASE_URL: MINIMAL.DATABASE_URL })).toThrow(
        /JWT_ACCESS_SECRET/,
      );
      expect(() => validateEnv({ JWT_ACCESS_SECRET: SECRET })).toThrow(/DATABASE_URL/);
    });

    it('reports every problem at once, not one per restart', () => {
      // Boot-fix-boot-fix is a miserable loop; zod collects all issues.
      const failure = (): unknown => validateEnv({});

      expect(failure).toThrow(/DATABASE_URL/);
      expect(failure).toThrow(/JWT_ACCESS_SECRET/);
    });

    it('rejects a secret short enough to brute-force offline', () => {
      expect(() => validateEnv({ ...MINIMAL, JWT_ACCESS_SECRET: 'too-short' })).toThrow(
        /at least 32 characters/,
      );
    });

    it('rejects a malformed access-token lifetime', () => {
      expect(() => validateEnv({ ...MINIMAL, JWT_ACCESS_TTL: 'fifteen minutes' })).toThrow(
        /JWT_ACCESS_TTL/,
      );

      expect(validateEnv({ ...MINIMAL, JWT_ACCESS_TTL: '2h' }).JWT_ACCESS_TTL).toBe('2h');
    });
  });

  describe('SWAGGER_ENABLED', () => {
    it('serves docs by default outside production', () => {
      expect(validateEnv({ ...MINIMAL, NODE_ENV: 'development' }).SWAGGER_ENABLED).toBe(true);
      expect(validateEnv({ ...MINIMAL, NODE_ENV: 'test' }).SWAGGER_ENABLED).toBe(true);
    });

    it('defaults to development when NODE_ENV is unset', () => {
      expect(validateEnv({ ...MINIMAL }).SWAGGER_ENABLED).toBe(true);
    });

    it('withholds docs in production by default', () => {
      expect(validateEnv({ ...MINIMAL, NODE_ENV: 'production' }).SWAGGER_ENABLED).toBe(false);
    });

    it('lets an explicit value win in either direction', () => {
      expect(
        validateEnv({
          ...MINIMAL,
          NODE_ENV: 'production',
          SWAGGER_ENABLED: 'true',
        }).SWAGGER_ENABLED,
      ).toBe(true);

      expect(
        validateEnv({
          ...MINIMAL,
          NODE_ENV: 'development',
          SWAGGER_ENABLED: 'false',
        }).SWAGGER_ENABLED,
      ).toBe(false);
    });

    it('rejects a value that is neither true nor false', () => {
      // Without the enum, `SWAGGER_ENABLED=yes` would silently read as off.
      expect(() => validateEnv({ ...MINIMAL, SWAGGER_ENABLED: 'yes' })).toThrow(/SWAGGER_ENABLED/);
    });
  });

  describe('defaults', () => {
    it('fills in everything else so a minimal .env boots', () => {
      const env = validateEnv({ ...MINIMAL });

      expect(env.PORT).toBe(3000);
      expect(env.JWT_ACCESS_TTL).toBe('15m');
      expect(env.JWT_ISSUER).toBe('ember');
      expect(env.JWT_AUDIENCE).toBe('ember-api');
      expect(env.REFRESH_TOKEN_TTL_DAYS).toBe(30);
      expect(env.DATABASE_POOL_MAX).toBe(10);
      expect(env.THROTTLE_LIMIT).toBe(120);
    });

    it('trusts no proxy unless told how many there are', () => {
      // A wrong TRUST_PROXY lets clients spoof X-Forwarded-For past the
      // rate limiter, so the safe value is the default.
      expect(validateEnv({ ...MINIMAL }).TRUST_PROXY).toBe(0);
      expect(validateEnv({ ...MINIMAL, TRUST_PROXY: '2' }).TRUST_PROXY).toBe(2);
    });

    it('blocks cross-origin requests unless origins are listed', () => {
      expect(validateEnv({ ...MINIMAL }).CORS_ORIGINS).toBe('');
    });

    it('coerces numeric strings, since every env var arrives as text', () => {
      const env = validateEnv({ ...MINIMAL, PORT: '8080' });

      expect(env.PORT).toBe(8080);
    });
  });
});
