import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DRIZZLE } from './database/database.constants';

describe('AppController', () => {
  let appController: AppController;
  const execute = jest.fn();

  beforeEach(async () => {
    execute.mockReset();

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService, { provide: DRIZZLE, useValue: { execute } }],
    }).compile();

    appController = app.get<AppController>(AppController);
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
      execute.mockResolvedValue(undefined);

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
