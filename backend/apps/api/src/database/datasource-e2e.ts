/**
 * DataSource CLI réservé aux migrations E2E.
 * Le garde central interdit toute cible identique à DATABASE_URL.
 */
import 'dotenv/config';
import { DataSource } from 'typeorm';
import { resolveE2eDatabaseConfig } from '../config/e2e-database.config';

const connection = resolveE2eDatabaseConfig(process.env);

export default new DataSource({
  type: 'postgres',
  url: connection.url,
  ssl: connection.ssl,
  synchronize: false,
  entities: ['apps/api/src/modules/**/*.entity.ts'],
  migrations: ['apps/api/src/database/migrations/*.ts'],
});
