import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  configureApp(app, config);

  if (config.get<boolean>('SWAGGER_ENABLED')) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Ember API')
        .setDescription('Food delivery backend')
        .setVersion('1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('docs', app, document);
    logger.log('Swagger UI mounted at /docs');
  }

  const port = config.get<number>('PORT', 3000);
  await app.listen(port, '0.0.0.0');
  logger.log(`Listening on port ${port}`);
}

void bootstrap();
