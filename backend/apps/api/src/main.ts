/**
 * TCHATCHA — Bootstrap API (Étape 6.1, fondations).
 * App NestJS : préfixe /api/v1 (12-api-blueprint.md), validation globale,
 * versionnement, sécurités de base (CORS). Sans logique métier.
 */
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1', { exclude: ['health'] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors({ origin: true });

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);
  Logger.log(`🚀 API TCHATCHA démarrée : http://localhost:${port}/api/v1`, 'Bootstrap');
}

void bootstrap();