/**
 * TCHATCHA — Setup Jest E2E : charge les variables depuis le .env racine
 * (backend/.env) car nx jette la cwd sur apps/api. Requis pour que
 * DATABASE_URL / JWT_REFRESH_SECRET / etc. soient visibles avant AppModule.
 */
import { config as loadEnv } from 'dotenv';
import * as path from 'path';

const rootEnv = path.resolve(__dirname, '../../../.env');
loadEnv({ path: rootEnv });
