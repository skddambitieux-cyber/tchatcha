/**
 * TCHATCHA — Helper E2E : construit l'app NestJS complète (AppModule réel)
 * avec la base de test isolée (TestDatabaseModule) et le même setup que
 * main.ts (préfixe /api/v1, ValidationPipe). Expose le serveur supertest.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DatabaseModule } from '../src/database/database.module';
import { TestDatabaseModule } from './database-test.module';
import { TestSmsSpy } from './sms-spy';
import { OtpSenderPortToken } from '../src/modules/auth/application/ports/otp-sender.port';

export interface TestApp {
  app: INestApplication;
  http: ReturnType<typeof request>;
  sms: TestSmsSpy;
  close: () => Promise<void>;
}

export async function createTestApp(): Promise<TestApp> {
  const sms = new TestSmsSpy();
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideModule(DatabaseModule)
    .useModule(TestDatabaseModule)
    .overrideProvider(OtpSenderPortToken)
    .useValue(sms)
    .compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors({ origin: true });

  await app.init();
  const http = request(app.getHttpServer());
  return {
    app,
    http,
    sms,
    close: () => app.close(),
  };
}