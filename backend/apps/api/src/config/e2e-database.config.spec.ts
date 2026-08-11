import { describe, expect, it } from '@jest/globals';
import {
  resolveE2eDatabaseConfig,
  supabaseProjectRef,
} from './e2e-database.config';

const safeEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://main:main-secret@localhost:5432/tchatcha',
  E2E_DATABASE_URL: 'postgresql://e2e:e2e-secret@localhost:5432/tchatcha_e2e',
  E2E_DB_SSL: 'disabled',
};

describe('resolveE2eDatabaseConfig', () => {
  it('accepte deux bases PostgreSQL explicitement distinctes', () => {
    expect(resolveE2eDatabaseConfig(safeEnv)).toEqual({
      url: safeEnv.E2E_DATABASE_URL,
      ssl: undefined,
    });
  });

  it('configure SSL pour un projet E2E distant', () => {
    expect(
      resolveE2eDatabaseConfig({ ...safeEnv, E2E_DB_SSL: 'require' }).ssl,
    ).toEqual({ rejectUnauthorized: false });
  });

  it.each([
    ['E2E_DATABASE_URL absente', { E2E_DATABASE_URL: undefined }],
    ['NODE_ENV non test', { NODE_ENV: 'development' }],
    ['SSL non explicite', { E2E_DB_SSL: undefined }],
    ['protocole non PostgreSQL', { E2E_DATABASE_URL: 'https://localhost/db' }],
  ])('refuse une configuration invalide : %s', (_label, override) => {
    expect(() => resolveE2eDatabaseConfig({ ...safeEnv, ...override })).toThrow(
      /^Configuration E2E refusée:/u,
    );
  });

  it('refuse la même connexion principale', () => {
    expect(() =>
      resolveE2eDatabaseConfig({
        ...safeEnv,
        E2E_DATABASE_URL: safeEnv.DATABASE_URL,
      }),
    ).toThrow('la base E2E doit être distincte');
  });

  it('refuse le même projet Supabase entre host direct et pooler', () => {
    expect(() =>
      resolveE2eDatabaseConfig({
        ...safeEnv,
        DATABASE_URL:
          'postgresql://postgres:main-secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres',
        E2E_DATABASE_URL:
          'postgresql://postgres.abcdefghijklmnopqrst:e2e-secret@aws-0-eu-west-1.pooler.supabase.com:5432/postgres',
        E2E_DB_SSL: 'require',
      }),
    ).toThrow('le projet Supabase E2E doit être distinct');
  });

  it('accepte deux projets Supabase distincts', () => {
    expect(() =>
      resolveE2eDatabaseConfig({
        ...safeEnv,
        DATABASE_URL:
          'postgresql://postgres:main-secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres',
        E2E_DATABASE_URL:
          'postgresql://postgres.zyxwvutsrqponmlkjihg:e2e-secret@aws-0-eu-west-1.pooler.supabase.com:5432/postgres',
        E2E_DB_SSL: 'require',
      }),
    ).not.toThrow();
  });

  it('ne révèle jamais les URLs ou mots de passe dans une erreur', () => {
    const secret = 'mot-de-passe-ultra-secret';
    let message = '';
    try {
      resolveE2eDatabaseConfig({
        ...safeEnv,
        DATABASE_URL: `postgresql://same:${secret}@localhost:5432/same`,
        E2E_DATABASE_URL: `postgresql://same:${secret}@localhost:5432/same`,
      });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toContain(secret);
    expect(message).not.toContain('postgresql://');
  });
});

describe('supabaseProjectRef', () => {
  it('reconnaît les URLs directes et pooler', () => {
    expect(
      supabaseProjectRef(
        new URL('postgresql://postgres:x@db.projectref.supabase.co/postgres'),
      ),
    ).toBe('projectref');
    expect(
      supabaseProjectRef(
        new URL(
          'postgresql://postgres.projectref:x@aws-0-africa.pooler.supabase.com/postgres',
        ),
      ),
    ).toBe('projectref');
  });
});
