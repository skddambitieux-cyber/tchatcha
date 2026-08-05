/**
 * TCHATCHA — DataSource TypeORM (migrations) — Supabase PostgreSQL.
 * Connexion via DATABASE_URL (voir .env, jamais commitée).
 * SSL requis par Supabase ; globs relatifs au CWD (backend/) pour le CLI.
 */
import 'dotenv/config';
import { DataSource } from 'typeorm';

export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
  synchronize: false,
  entities: ['apps/api/src/modules/**/*.entity.ts'],
  migrations: ['apps/api/src/database/migrations/*.ts'],
});