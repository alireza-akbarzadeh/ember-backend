import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { ApiCatalogService } from './home/api-catalog.service';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  configureApp(app, config);

  // The document is built either way: the home page lists routes from it, and
  // that list should be accurate in production too. Only the UI is gated.
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Ember API')
      .setDescription('Food delivery backend')
      .setVersion('1.0')
      .addBearerAuth()
      .build(),
  );
  app.get(ApiCatalogService).loadFrom(document);

  if (config.get<boolean>('SWAGGER_ENABLED')) {
    SwaggerModule.setup('docs', app, document);
    logger.log('Swagger UI mounted at /docs');
  }

  const port = config.get<number>('PORT', 3000);
  await app.listen(port, '0.0.0.0');
  logger.log(`Listening on port ${port}`);
}

void bootstrap();
