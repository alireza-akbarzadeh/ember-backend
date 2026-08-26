import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';

/**
 * Everything that turns a bare Nest app into the running service.
 *
 * Lives here rather than inline in `main.ts` so end-to-end tests boot the
 * *same* app: a validation pipe or prefix configured only in `main.ts` is
 * invisible to Supertest, and tests then pass against a setup that does not
 * exist in production.
 */
export function configureApp(app: NestExpressApplication, config: ConfigService): void {
  app.use(helmet());

  // Rate limiting and audit logging both key off the client IP, and both are
  // worthless if Express reads it from a header any client can set. 0 means
  // "no proxy — use the socket address".
  const trustProxy = config.get<number>('TRUST_PROXY', 0);
  app.set('trust proxy', trustProxy === 0 ? false : trustProxy);

  const corsOrigins = config
    .get<string>('CORS_ORIGINS', '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : false,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // No endpoint accepts a payload anywhere near this size; the cap keeps a
  // large body from becoming a cheap denial of service.
  app.useBodyParser('json', { limit: '100kb' });

  app.useGlobalPipes(
    new ValidationPipe({
      // whitelist strips undecorated properties — the cheapest
      // mass-assignment defence there is. forbidNonWhitelisted turns the
      // silent strip into a 400, so a client sending `role: "admin"` finds
      // out it was rejected rather than wondering why it had no effect.
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // Probes keep their unprefixed paths so orchestrator config doesn't depend
  // on the API prefix, and `/` stays a real route so opening the server in a
  // browser lands somewhere instead of 404ing.
  app.setGlobalPrefix('api', {
    exclude: ['health', 'health/ready', { path: '/', method: RequestMethod.GET }],
  });

  app.enableShutdownHooks();
}
