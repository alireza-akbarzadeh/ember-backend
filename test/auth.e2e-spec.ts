import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { DRIZZLE, type Database } from '../src/database/database.constants';
import { users } from '../src/database/schema/users';

interface AuthBody {
  tokenType: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: { id: string; email: string; role: string; status: string };
}

interface ErrorBody {
  statusCode: number;
  message: string | string[];
}

/** supertest types `body` as `any`; name the shape once instead of everywhere. */
function jsonBody<T>(response: request.Response): T {
  return response.body as T;
}

/**
 * Hits the real AppModule against a real database — point DATABASE_URL at a
 * throwaway Postgres/Neon branch and run `pnpm db:migrate` against it first.
 * Every account created here is deleted in `afterAll`.
 *
 * Throttling is disabled: the credential endpoints allow 5 requests a minute,
 * which this suite exceeds by design. Rate limiting is configuration, and
 * asserting it here would mean a slow, timing-dependent test.
 */
describe('Auth (e2e)', () => {
  let app: NestExpressApplication;
  let server: App;
  let db: Database;

  const createdEmails: string[] = [];

  function newAccount() {
    const email = `e2e-${randomUUID()}@example.com`;
    createdEmails.push(email);

    return { email, password: 'correct horse battery', fullName: 'E2E User' };
  }

  async function registerAccount(account: ReturnType<typeof newAccount>): Promise<AuthBody> {
    const response = await request(server).post('/api/auth/register').send(account).expect(201);

    return jsonBody<AuthBody>(response);
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    configureApp(app, app.get(ConfigService));
    await app.init();

    server = app.getHttpServer() as App;
    db = app.get<Database>(DRIZZLE);
  });

  afterAll(async () => {
    if (createdEmails.length > 0) {
      await db.delete(users).where(inArray(users.email, createdEmails));
    }
    await app.close();
  });

  describe('POST /api/auth/register', () => {
    it('creates an account and returns a token pair', async () => {
      const account = newAccount();
      const body = await registerAccount(account);

      expect(body.tokenType).toBe('Bearer');
      expect(body.accessToken).toEqual(expect.any(String));
      expect(body.refreshToken).toEqual(expect.any(String));
      expect(body.user).toMatchObject({
        email: account.email,
        role: 'customer',
        status: 'active',
      });
      expect(JSON.stringify(body)).not.toContain('passwordHash');
    });

    it('rejects an attempt to self-assign a role', async () => {
      await request(server)
        .post('/api/auth/register')
        .send({ ...newAccount(), role: 'admin' })
        .expect(400);
    });

    it('rejects a password below the minimum length', async () => {
      await request(server)
        .post('/api/auth/register')
        .send({ ...newAccount(), password: 'short' })
        .expect(400);
    });

    it('rejects a malformed email', async () => {
      await request(server)
        .post('/api/auth/register')
        .send({ ...newAccount(), email: 'not-an-email' })
        .expect(400);
    });

    it('reports a duplicate email as a conflict', async () => {
      const account = newAccount();
      await registerAccount(account);

      await request(server).post('/api/auth/register').send(account).expect(409);
    });

    it('treats the email case-insensitively', async () => {
      const account = newAccount();
      await registerAccount(account);

      await request(server)
        .post('/api/auth/register')
        .send({ ...account, email: account.email.toUpperCase() })
        .expect(409);
    });
  });

  describe('POST /api/auth/login', () => {
    it('accepts valid credentials', async () => {
      const account = newAccount();
      await registerAccount(account);

      const response = await request(server)
        .post('/api/auth/login')
        .send({ email: account.email, password: account.password })
        .expect(200);

      expect(jsonBody<AuthBody>(response).accessToken).toEqual(expect.any(String));
    });

    it('rejects a wrong password', async () => {
      const account = newAccount();
      await registerAccount(account);

      await request(server)
        .post('/api/auth/login')
        .send({ email: account.email, password: 'wrong password here' })
        .expect(401);
    });

    it('answers an unknown email the same way as a wrong password', async () => {
      const response = await request(server)
        .post('/api/auth/login')
        .send({
          email: `absent-${randomUUID()}@example.com`,
          password: 'correct horse battery',
        })
        .expect(401);

      expect(jsonBody<ErrorBody>(response).message).toBe('Invalid email or password');
    });
  });

  describe('protected routes', () => {
    it('rejects a request with no token', async () => {
      await request(server).get('/api/users/me').expect(401);
    });

    it('rejects a garbage token', async () => {
      await request(server)
        .get('/api/users/me')
        .set('Authorization', 'Bearer not-a-real-token')
        .expect(401);
    });

    it('returns the caller’s own profile', async () => {
      const account = newAccount();
      const session = await registerAccount(account);

      const response = await request(server)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(200);

      const profile = jsonBody<{ email: string }>(response);
      expect(profile.email).toBe(account.email);
      expect(profile).not.toHaveProperty('passwordHash');
    });

    it('refuses an admin-only route to a customer', async () => {
      const session = await registerAccount(newAccount());

      await request(server)
        .get(`/api/users/${session.user.id}`)
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(403);
    });

    it('rejects unknown properties on a profile update', async () => {
      const session = await registerAccount(newAccount());

      await request(server)
        .patch('/api/users/me')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ fullName: 'New Name', role: 'admin' })
        .expect(400);
    });

    it('applies a valid profile update', async () => {
      const session = await registerAccount(newAccount());

      const response = await request(server)
        .patch('/api/users/me')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ fullName: 'Updated Name' })
        .expect(200);

      expect(jsonBody<{ fullName: string }>(response).fullName).toBe('Updated Name');
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('rotates the token pair', async () => {
      const session = await registerAccount(newAccount());

      const response = await request(server)
        .post('/api/auth/refresh')
        .send({ refreshToken: session.refreshToken })
        .expect(200);

      const rotated = jsonBody<AuthBody>(response);
      expect(rotated.refreshToken).not.toBe(session.refreshToken);

      await request(server)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${rotated.accessToken}`)
        .expect(200);
    });

    it('kills the session when a rotated token is replayed', async () => {
      const session = await registerAccount(newAccount());

      const response = await request(server)
        .post('/api/auth/refresh')
        .send({ refreshToken: session.refreshToken })
        .expect(200);

      const rotated = jsonBody<AuthBody>(response);

      // Replaying the burned token is treated as theft...
      await request(server)
        .post('/api/auth/refresh')
        .send({ refreshToken: session.refreshToken })
        .expect(401);

      // ...so its replacement is revoked along with it.
      await request(server)
        .post('/api/auth/refresh')
        .send({ refreshToken: rotated.refreshToken })
        .expect(401);
    });

    it('rejects a token that was never issued', async () => {
      await request(server).post('/api/auth/refresh').send({ refreshToken: 'nope' }).expect(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('makes the refresh token unusable', async () => {
      const session = await registerAccount(newAccount());

      await request(server)
        .post('/api/auth/logout')
        .send({ refreshToken: session.refreshToken })
        .expect(204);

      await request(server)
        .post('/api/auth/refresh')
        .send({ refreshToken: session.refreshToken })
        .expect(401);
    });
  });
});
