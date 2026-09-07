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
import { InMemoryStorage } from './in-memory-storage';
import { OtpSenderPortToken } from '../src/modules/auth/application/ports/otp-sender.port';
import { StoragePortToken } from '../src/modules/media/domain/ports/storage.port';
import { PaymentGatewayPortToken } from '../src/modules/pay/application/ports/payment-gateway.port';
import type { PaymentGatewayPort } from '../src/modules/pay/application/ports/payment-gateway.port';
import { TestPaymentGateway } from './test-payment-gateway';

export interface TestApp {
  app: INestApplication;
  http: ReturnType<typeof request>;
  sms: TestSmsSpy;
  storage: InMemoryStorage;
  close: () => Promise<void>;
}

export async function createTestApp(options: { paymentGateway?: PaymentGatewayPort } = {}): Promise<TestApp> {
  const sms = new TestSmsSpy();
  const storage = new InMemoryStorage();
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideModule(DatabaseModule)
    .useModule(TestDatabaseModule)
    .overrideProvider(OtpSenderPortToken)
    .useValue(sms)
    .overrideProvider(StoragePortToken)
    .useValue(storage)
    .overrideProvider(PaymentGatewayPortToken)
    .useValue(options.paymentGateway ?? new TestPaymentGateway())
    .compile();

  const app = moduleRef.createNestApplication({ rawBody: true });
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
    storage,
    close: () => app.close(),
  };
}
