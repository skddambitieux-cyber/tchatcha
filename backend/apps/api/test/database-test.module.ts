/**
 * TCHATCHA — Module de base pour les tests E2E (suite 6.2-E2E).
 * Surcharge DatabaseModule : pointe exclusivement vers E2E_DATABASE_URL,
 * validée comme distincte de DATABASE_URL avant toute connexion.
 */
import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { resolveE2eDatabaseConfig } from '../src/config/e2e-database.config';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => {
        const conn = resolveE2eDatabaseConfig(process.env);
        return {
          type: 'postgres',
          url: conn.url,
          ssl: conn.ssl,
          autoLoadEntities: true,
          // Le schéma E2E doit provenir exclusivement des migrations 001→003.
          synchronize: false,
          migrationsRun: false,
          logging: false,
        };
      },
    }),
  ],
})
export class TestDatabaseModule {}
