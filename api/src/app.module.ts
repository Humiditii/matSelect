import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CONFIGS } from './common/constants/configs.constant';
import { AllGlobalExceptionsFilter } from './common/filters/globalFilter.filters';
import { LoggingModule } from './common/logging/logging.module';
import { HttpLogger } from './common/middleware/httpLogger.middleware';
import { ApiKeyModule } from './core/apiKey/apiKey.module';
import { ExplanationModule } from './core/explanation/explanation.module';
import { LlmModule } from './core/llm/llm.module';
import { MaterialModule } from './core/material/material.module';
import { SelectionModule } from './core/selection/selection.module';
import { SourcingModule } from './core/sourcing/sourcing.module';
import { SpecModule } from './core/spec/spec.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: '.env',
      isGlobal: true,
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => ({
        uri: config.get<string>('DB_URL'),
        serverSelectionTimeoutMS: 5000,
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          name: 'default',
          ttl: 60_000,
          limit:
            Number(config.get('RATE_LIMIT_PER_MIN')) ||
            CONFIGS.DEFAULT_RATE_LIMIT_PER_MIN,
        },
      ],
    }),
    LoggingModule,
    LlmModule,
    SpecModule,
    MaterialModule,
    ExplanationModule,
    SelectionModule,
    ApiKeyModule,
    SourcingModule,
  ],
  controllers: [AppController],
  providers: [
    AllGlobalExceptionsFilter,
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_FILTER,
      useClass: AllGlobalExceptionsFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(HttpLogger).forRoutes('*');
  }
}
