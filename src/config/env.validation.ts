import { z } from 'zod';

/**
 * Fail-fast environment contract.
 *
 * Anything the app cannot run without is required here so a misconfigured
 * deploy dies at boot with a readable message instead of throwing 500s on the
 * first request that happens to need the value.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),

  // 32+ chars: a short secret makes HS256 brute-forceable offline.
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  // `ms`-style duration. The shape is enforced here so `AuthModule` can hand
  // it to jsonwebtoken, which types it as a template literal rather than a
  // plain string.
  JWT_ACCESS_TTL: z
    .string()
    .regex(/^\d+[smhd]$/, 'JWT_ACCESS_TTL must look like 15m, 2h or 7d')
    .default('15m'),
  JWT_ISSUER: z.string().default('ember'),
  JWT_AUDIENCE: z.string().default('ember-api'),

  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

  // Comma-separated list; empty means "same-origin only".
  CORS_ORIGINS: z.string().default(''),

  // Number of reverse proxies in front of the app. Must match reality: too
  // high and a client can spoof its IP through X-Forwarded-For, defeating the
  // rate limiter; too low and every request looks like it came from the proxy.
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),

  THROTTLE_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(120),

  SWAGGER_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  return result.data;
}
