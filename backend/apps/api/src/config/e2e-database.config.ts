export interface E2eDatabaseConfig {
  url: string;
  ssl: { rejectUnauthorized: false } | undefined;
}

type Environment = Record<string, string | undefined>;

const SAFE_ERROR_PREFIX = 'Configuration E2E refusée:';

function fail(reason: string): never {
  throw new Error(`${SAFE_ERROR_PREFIX} ${reason}`);
}

function parsePostgresUrl(value: string | undefined, name: string): URL {
  if (!value?.trim()) fail(`${name} est obligatoire`);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${name} doit être une URL PostgreSQL valide`);
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    fail(`${name} doit utiliser le protocole PostgreSQL`);
  }
  return parsed;
}

function connectionIdentity(url: URL): string {
  const port = url.port || '5432';
  const database = decodeURIComponent(url.pathname.replace(/^\//u, ''));
  return [url.hostname.toLowerCase(), port, database].join('|');
}

/** Extrait le project ref d'une URL directe ou d'un pooler Supabase. */
export function supabaseProjectRef(url: URL): string | null {
  const hostname = url.hostname.toLowerCase();
  const direct = /^db\.([a-z0-9]+)\.supabase\.co$/u.exec(hostname);
  if (direct) return direct[1];
  if (!hostname.endsWith('.pooler.supabase.com')) return null;
  const username = decodeURIComponent(url.username).toLowerCase();
  const pooler = /^postgres\.([a-z0-9]+)$/u.exec(username);
  return pooler?.[1] ?? null;
}

export function resolveE2eDatabaseConfig(env: Environment): E2eDatabaseConfig {
  if (env.NODE_ENV !== 'test') {
    fail('NODE_ENV doit valoir test');
  }

  const e2e = parsePostgresUrl(env.E2E_DATABASE_URL, 'E2E_DATABASE_URL');
  const main = parsePostgresUrl(env.DATABASE_URL, 'DATABASE_URL');

  if (connectionIdentity(e2e) === connectionIdentity(main)) {
    fail('la base E2E doit être distincte de la base principale');
  }

  const e2eProject = supabaseProjectRef(e2e);
  const mainProject = supabaseProjectRef(main);
  if (e2eProject && mainProject && e2eProject === mainProject) {
    fail('le projet Supabase E2E doit être distinct du projet principal');
  }

  if (!['require', 'disabled'].includes(env.E2E_DB_SSL ?? '')) {
    fail('E2E_DB_SSL doit valoir require ou disabled');
  }

  return {
    url: env.E2E_DATABASE_URL as string,
    ssl: env.E2E_DB_SSL === 'require' ? { rejectUnauthorized: false } : undefined,
  };
}
