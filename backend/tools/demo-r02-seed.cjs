/* Local-only DEMO_R02 data for mobile search validation. */
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const MARKER = 'DEMO_R02';
const ROOT = path.resolve(__dirname, '..');
const envLines = fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/);
const mode = process.argv[2] ?? 'check';

function printHelp() {
  console.log(`DEMO_R02 — données locales de démonstration pour la recherche mobile

Commandes :
  check    Vérifie la garde locale et l’état des données ; aucune écriture.
  seed     Crée ou met à jour uniquement les données DEMO_R02 ; idempotent.
  cleanup  Supprime uniquement les données marquées DEMO_R02 ; action
           destructive locale, jamais exécutée implicitement.

Prérequis obligatoires :
  NODE_ENV=test
  E2E_DATABASE_URL défini dans backend/.env
  hôte 127.0.0.1 ou localhost
  base tchatcha_e2e
  DATABASE_URL distante ignorée

Exemples PowerShell depuis backend :
  $env:NODE_ENV='test'
  node tools/demo-r02-seed.cjs check
  node tools/demo-r02-seed.cjs seed
  node tools/demo-r02-seed.cjs cleanup`);
}

if (mode === '--help' || mode === 'help') {
  printHelp();
  process.exit(0);
}

if (!['check', 'seed', 'cleanup'].includes(mode)) {
  printHelp();
  console.error(`Commande inconnue : ${mode}`);
  process.exit(1);
}

if (process.env.NODE_ENV !== 'test') {
  throw new Error('NODE_ENV=test est obligatoire.');
}

// Deliberately read only E2E_DATABASE_URL; DATABASE_URL is never inspected.
const e2eUrl = envLines.find((line) => line.startsWith('E2E_DATABASE_URL='))?.slice(18);
if (!e2eUrl) throw new Error('E2E_DATABASE_URL est absente.');
process.env.DATABASE_URL = e2eUrl;
const sslValue = envLines.find((line) => line.startsWith('E2E_DB_SSL='))?.slice(11) ?? 'false';
const ssl = sslValue === 'true' ? { rejectUnauthorized: false } : false;
const parsed = new URL(process.env.DATABASE_URL);

function assertLocal(target) {
  const host = (target.hostname || target.host || '').replace(/\/\d+$/, '');
  if (!['127.0.0.1', 'localhost'].includes(host) || String(target.port) !== '5432') {
    throw new Error('Garde refusée : PostgreSQL local 127.0.0.1:5432 requis.');
  }
  if (target.pathname.slice(1) !== 'tchatcha_e2e') {
    throw new Error('Garde refusée : base tchatcha_e2e requise.');
  }
}

assertLocal(parsed);

const records = [
  { key: '01', name: 'Démo Carrelage Cotonou', job: 'carreleurs', service: 'Pose de carrelage', price: 6500, city: 'Cotonou', lon: 2.42, lat: 6.37, verified: true, rating: 4.8 },
  { key: '02', name: 'Démo Carrelage Calavi', job: 'carreleurs', service: 'Rénovation carrelage', price: 5500, city: 'Abomey-Calavi', lon: 2.35, lat: 6.45, verified: false, rating: 4.2 },
  { key: '03', name: 'Démo Plomberie Cotonou', job: 'plombiers', service: 'Dépannage plomberie', price: 7000, city: 'Cotonou', lon: 2.43, lat: 6.37, verified: false, rating: 4.1 },
  { key: '04', name: 'Démo Électricité Calavi', job: 'electriciens', service: 'Installation électrique', price: 6000, city: 'Abomey-Calavi', lon: 2.36, lat: 6.45, verified: true, rating: 4.7 },
  { key: '05', name: 'Démo Peinture Cotonou', job: 'peintres', service: 'Peinture intérieure', price: 5000, city: 'Cotonou', lon: 2.41, lat: 6.38, verified: false, rating: 4.0 },
  { key: '06', name: 'Démo Maçonnerie Calavi', job: 'macons', service: 'Travaux de maçonnerie', price: 9000, city: 'Abomey-Calavi', lon: 2.34, lat: 6.46, verified: false, rating: 4.3 },
];

async function connect() {
  // Keep the process-level DATABASE_URL assignment explicit for every connection.
  process.env.DATABASE_URL = e2eUrl;
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl });
  await client.connect();
  const { rows: [meta] } = await client.query(
    'select current_database() as database, inet_server_addr()::text as host, inet_server_port() as port',
  );
  assertLocal({
    host: meta.host,
    port: String(meta.port),
    pathname: `/${meta.database}`,
  });
  return client;
}

async function getIds(client) {
  const { rows: categories } = await client.query(
    `select slug, id from pros.categories
      where country_code = 'BJ' and active = true and deleted_at is null
        and slug = any($1::text[])`,
    [[...new Set(records.map((record) => record.job))]],
  );
  const categoryMap = new Map(categories.map((row) => [row.slug, row.id]));
  for (const record of records) {
    if (!categoryMap.has(record.job)) throw new Error(`Catégorie absente: ${record.job}`);
  }
  const { rows: divisions } = await client.query(
    `select name, id from geo.divisions
      where country_code = 'BJ' and type = 'COMMUNE' and active = true
        and name = any($1::text[])`,
    [[...new Set(records.map((record) => record.city))]],
  );
  const divisionMap = new Map(divisions.map((row) => [row.name, row.id]));
  for (const record of records) {
    if (!divisionMap.has(record.city)) throw new Error(`Commune absente: ${record.city}`);
  }
  return { categoryMap, divisionMap };
}

async function seed() {
  const client = await connect();
  try {
    await client.query('begin');
    const { categoryMap, divisionMap } = await getIds(client);
    for (const record of records) {
      const userId = `00000000-0000-4000-8000-0000000000${record.key}`;
      const profileId = `00000000-0000-4000-8001-0000000000${record.key}`;
      const serviceId = `00000000-0000-4000-8002-0000000000${record.key}`;
      const phone = `999902${record.key}`;
      const categoryId = categoryMap.get(record.job);
      const divisionId = divisionMap.get(record.city);
      const existing = await client.query(
        'select id from pros.profiles where business_name = $1 for update',
        [`${MARKER} | ${record.name}`],
      );
      if (existing.rowCount === 0) {
        await client.query(
          `insert into users.users
             (id, country_code, phone, password_hash, full_name, status, created_at, updated_at)
           values ($1, 'BJ', $2, '', $3, 'ACTIVE', now(), now())
           on conflict (id) do nothing`,
          [userId, phone, `${MARKER} | ${record.name}`],
        );
        await client.query(
          `insert into users.user_roles (user_id, role, granted_at)
           values ($1, 'PROFESSIONAL', now()) on conflict do nothing`,
          [userId],
        );
        await client.query(
          `insert into pros.profiles
             (id, user_id, business_name, headline, description, experience_years,
              employees_count, status, verified, verified_at, rating_avg, rating_count,
              trust_score, completed_jobs, min_price, currency, country_code, created_at, updated_at)
           values ($1, $2, $3, $4, $5, 6, 2, 'ACTIVE', $6, case when $6 then now() else null end,
                   $7, 12, 0.80, 12, $8, 'XOF', 'BJ', now(), now())`,
          [profileId, userId, `${MARKER} | ${record.name}`, `${record.job} professionnel`, `Service de démonstration ${record.name}.`, record.verified, record.rating, record.price],
        );
        await client.query(
          `insert into pros.services
             (id, professional_id, category_id, title, description, price_from, price_to,
              price_unit, is_primary, sort_order, created_at, updated_at)
           values ($1, $2, $3, $4, $5, $6, $6, 'PER_JOB', true, 0, now(), now())`,
          [serviceId, profileId, categoryId, record.service, 'Tarif indicatif de démonstration.', record.price],
        );
        await client.query(
          `insert into pros.locations
             (professional_id, country_code, division_id, location, service_radius_km,
              address_text, updated_at)
           values ($1, 'BJ', $2, ST_SetSRID(ST_MakePoint($3, $4), 4326), 15, null, now())`,
          [profileId, divisionId, record.lon, record.lat],
        );
        await client.query(
          `insert into pros.reputation
             (professional_id, completed_jobs, verification_level, trust_score, trust_level,
              recomputed_at, created_at, updated_at)
           values ($1, 12, $2, 0.80, 'TRUSTED', now(), now(), now())`,
          [profileId, record.verified ? 2 : 0],
        );
        for (let weekday = 1; weekday <= 5; weekday += 1) {
          await client.query(
            `insert into pros.business_hours
               (professional_id, weekday, open_at, close_at, closed)
             values ($1, $2, '08:00', '17:00', false)`,
            [profileId, weekday],
          );
        }
      }
      const profile = await client.query(
        'select id from pros.profiles where business_name = $1',
        [`${MARKER} | ${record.name}`],
      );
      if (profile.rowCount !== 1) throw new Error(`Profil DEMO_R02 invalide: ${record.name}`);
      await client.query('select search.rebuild_professional_search_doc($1::uuid)', [profile.rows[0].id]);
    }
    await client.query('commit');
    console.log(JSON.stringify({ mode: 'seed', marker: MARKER, professionals: records.length }));
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    await client.end();
  }
}

async function cleanup() {
  const client = await connect();
  try {
    await client.query('begin');
    await client.query(`delete from media.files where owner_id in (select id from pros.profiles where business_name like $1)`, [`${MARKER} |%`]);
    await client.query(`delete from search.pro_search_docs where professional_id in (select id from pros.profiles where business_name like $1)`, [`${MARKER} |%`]);
    await client.query(`delete from pros.business_hours where professional_id in (select id from pros.profiles where business_name like $1)`, [`${MARKER} |%`]);
    await client.query(`delete from pros.locations where professional_id in (select id from pros.profiles where business_name like $1)`, [`${MARKER} |%`]);
    await client.query(`delete from pros.services where professional_id in (select id from pros.profiles where business_name like $1)`, [`${MARKER} |%`]);
    await client.query(`delete from pros.reputation where professional_id in (select id from pros.profiles where business_name like $1)`, [`${MARKER} |%`]);
    await client.query(`delete from pros.profiles where business_name like $1`, [`${MARKER} |%`]);
    await client.query(`delete from users.user_roles where user_id in (select id from users.users where full_name like $1)`, [`${MARKER} |%`]);
    const result = await client.query(`delete from users.users where full_name like $1`, [`${MARKER} |%`]);
    await client.query('commit');
    console.log(JSON.stringify({ mode: 'cleanup', marker: MARKER, users_deleted: result.rowCount }));
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    await client.end();
  }
}

async function check() {
  const client = await connect();
  try {
    const { categoryMap, divisionMap } = await getIds(client);
    console.log(JSON.stringify({ mode: 'check', marker: MARKER, database: 'tchatcha_e2e', host: '127.0.0.1', port: 5432, categories: categoryMap.size, divisions: divisionMap.size, records: records.length }));
  } finally {
    await client.end();
  }
}

Promise.resolve(mode === 'seed' ? seed() : mode === 'cleanup' ? cleanup() : mode === 'check' ? check() : Promise.reject(new Error('Usage: seed|cleanup|check')))
  .catch((error) => { console.error(error.message); process.exitCode = 1; });
