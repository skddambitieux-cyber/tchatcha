/**
 * TCHATCHA — Module de base pour les tests E2E (suite 6.2-E2E).
 * Surcharge DatabaseModule : pointe vers E2E_DATABASE_URL (base isolée) si
 * présent, sinon DATABASE_URL ; synchronize active pour créer le schéma de
 * test sans migrations. Jamais utilisé en production.
 */
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

const urlFor = (config: ConfigService): { url: string; ssl: object | undefined } => {
  const url =
    process.env.E2E_DATABASE_URL ??
    process.env.DATABASE_URL ??
    config.getOrThrow<string>('DATABASE_URL');
  const ssl =
    process.env.E2E_DB_SSL ?? process.env.DB_SSL === 'require'
      ? { rejectUnauthorized: false }
      : undefined;
  return { url, ssl };
};

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const conn = urlFor(config);
        return {
          type: 'postgres',
          url: conn.url,
          ssl: conn.ssl,
          autoLoadEntities: true,
          synchronize: true,
          migrationsRun: false,
          logging: false,
        };
      },
    }),
  ],
})
export class TestDatabaseModule {}