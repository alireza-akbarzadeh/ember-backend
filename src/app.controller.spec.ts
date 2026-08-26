import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DRIZZLE } from './database/database.constants';
import { ApiCatalogService } from './home/api-catalog.service';

describe('AppController', () => {
  let appController: AppController;
  let catalog: ApiCatalogService;
  const execute = jest.fn();
  let swaggerEnabled = true;

  beforeEach(async () => {
    execute.mockReset();
    swaggerEnabled = true;

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        ApiCatalogService,
        { provide: DRIZZLE, useValue: { execute } },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, fallback?: unknown) =>
              key === 'SWAGGER_ENABLED' ? swaggerEnabled : fallback,
          },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
    catalog = app.get<ApiCatalogService>(ApiCatalogService);
  });

  describe('index', () => {
    it('renders a page with a link to the docs', async () => {
      execute.mockResolvedValue({ rows: [{ present: 'users' }] });

      const html = await appController.index();

      expect(html).toContain('<!doctype html>');
      expect(html).toContain('href="/docs"');
      expect(html).toContain('href="/health"');
    });

    it('carries no inline script, which the CSP would block', async () => {
      execute.mockResolvedValue({ rows: [{ present: 'users' }] });

      const html = await appController.index();

      // helmet sets script-src 'self'; an inline <script> would silently die.
      expect(html).not.toMatch(/<script/i);
    });

    it('tells the reader to migrate when the tables are absent', async () => {
      execute.mockResolvedValue({ rows: [{ present: null }] });

      const html = await appController.index();

      expect(html).toContain('Tables not created yet');
      expect(html).toContain('pnpm db:migrate');
    });

    it('reports a dead database instead of rendering a broken page', async () => {
      execute.mockRejectedValue(new Error('connection refused'));

      const html = await appController.index();

      expect(html).toContain('No database connection');
      expect(html).toContain('DATABASE_URL');
    });

    it('does not advertise docs that are not being served', async () => {
      swaggerEnabled = false;
      execute.mockResolvedValue({ rows: [{ present: 'users' }] });

      const html = await appController.index();

      // Linking to /docs when Swagger is off would send the reader to a 404.
      expect(html).not.toContain('href="/docs"');
      expect(html).toContain('SWAGGER_ENABLED=true');
    });

    it('lists the routes held by the catalog', async () => {
      execute.mockResolvedValue({ rows: [{ present: 'users' }] });
      catalog.loadFrom({
        openapi: '3.0.0',
        info: { title: 'Ember API', version: '1.0' },
        paths: {
          '/api/auth/login': {
            post: { tags: ['auth'], summary: 'Exchange credentials' },
          },
          '/api/users/me': {
            get: { tags: ['users'], summary: 'Own profile', security: [{ bearer: [] }] },
          },
        },
      } as never);

      const html = await appController.index();

      expect(html).toContain('/api/auth/login');
      expect(html).toContain('/api/users/me');
      expect(html).toContain('Exchange credentials');
    });

    it('escapes interpolated values rather than trusting them', async () => {
      execute.mockResolvedValue({ rows: [{ present: 'users' }] });
      catalog.loadFrom({
        openapi: '3.0.0',
        info: { title: 'x', version: '1' },
        paths: {
          '/api/<img src=x>': { get: { tags: ['evil'], summary: '<script>' } },
        },
      } as never);

      const html = await appController.index();

      expect(html).toContain('&lt;img src=x&gt;');
      expect(html).not.toMatch(/<script/i);
    });
  });

  describe('health', () => {
    it('reports ok without touching the database', () => {
      const result = appController.health();

      expect(result.status).toBe('ok');
      expect(typeof result.uptime).toBe('number');
      expect(execute).not.toHaveBeenCalled();
    });
  });

  describe('readiness', () => {
    it('reports ok when the database answers', async () => {
      execute.mockResolvedValue({ rows: [] });

      await expect(appController.readiness()).resolves.toEqual({
        status: 'ok',
        database: 'up',
      });
    });

    it('reports degraded instead of throwing when the database is down', async () => {
      execute.mockRejectedValue(new Error('connection refused'));

      await expect(appController.readiness()).resolves.toEqual({
        status: 'degraded',
        database: 'down',
      });
    });
  });
});
