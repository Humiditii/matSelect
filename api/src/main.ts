import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { CONFIGS } from './common/constants/configs.constant';
import { AllGlobalExceptionsFilter } from './common/filters/globalFilter.filters';

async function bootstrap() {
  const logger = new Logger('MAIN');

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  app.useBodyParser('json', { limit: '200kb' });

  // Behind a hosting proxy (Render, Nginx): use the client's real IP for rate limiting.
  app.set('trust proxy', 1);

  const filter = app.get(AllGlobalExceptionsFilter);
  app.useGlobalFilters(filter);

  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

  app.setGlobalPrefix('api', {
    exclude: ['/'],
  });

  app.enableCors({
    origin: (process.env.WEB_ORIGIN || 'http://localhost:3000')
      .split(',')
      .map((s) => s.trim()),
    methods: ['GET', 'POST'],
    allowedHeaders: ['content-type', CONFIGS.USER_KEY_HEADER],
  });
  app.enableShutdownHooks();

  const config = new DocumentBuilder()
    .setTitle('MatSelect api docs')
    .setDescription('AI-assisted, calculation-ranked material selection')
    .setVersion('1.0')
    .addTag('MatSelect')
    .build();
  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('api-docs', app, document);

  const port = process.env.PORT || 4000;
  await app.listen(port, () =>
    logger.log(`App running on Port: ${port} (docs: /api-docs)`),
  );
}
bootstrap();
