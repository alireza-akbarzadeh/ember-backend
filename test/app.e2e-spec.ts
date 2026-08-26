import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';

/**
 * Boots the real app: proves the module graph wires up, the probes answer
 * without credentials, and the global guard covers everything else.
 * Requires DATABASE_URL and the JWT settings — see .env.example.
 */
describe('AppController (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    configureApp(app, app.get(ConfigService));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the liveness probe unauthenticated and unprefixed', async () => {
    const response = await request(app.getHttpServer() as App)
      .get('/health')
      .expect(200);

    expect(response.body).toMatchObject({ status: 'ok' });
  });

  it('reports database reachability on the readiness probe', async () => {
    const response = await request(app.getHttpServer() as App)
      .get('/health/ready')
      .expect(200);

    expect(response.body).toEqual({ status: 'ok', database: 'up' });
  });

  it('protects everything that is not marked @Public()', async () => {
    await request(app.getHttpServer() as App)
      .get('/api/users/me')
      .expect(401);
  });
});
