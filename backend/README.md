# TCHATCHA — Backend (NestJS / Nx)

Plateforme de services de proximité au Bénin (Étape 6 — Développement MVP).
Monolithe modulaire (ADR-001) : NestJS 11 + TypeORM + PostgreSQL 16 (Supabase) + PostGIS.

## Prérequis

- **Node.js** (v20+ recommandé, v24 testé)
- **npm**
- **PostgreSQL** : une base PostgreSQL est nécessaire. Pour ce projet, la base
  PostgreSQL hébergée par **Supabase** peut être utilisée. Une installation
  PostgreSQL locale est **facultative**.
- **Redis** (requis seulement lorsque le cache/OTP sera activé)
- **MinIO** (facultatif : remplacé plus tard par un stockage S3 adapté)
- **Docker** : facultatif en local

> Note : Docker n'a pas été validé localement sur la machine de développement.
> La configuration Docker est vérifiée par GitHub Actions.

## Installation

```bash
npm install
```

## Variables d'environnement

Copier le fichier `.env.example` en `.env`, puis remplir les valeurs :

```bash
cp .env.example .env
```

Sous Windows PowerShell :

```powershell
Copy-Item .env.example .env
```

### Connexion Supabase

1. Dans Supabase : **Project Settings → Database → Connection string**.
2. Copier la chaîne PostgreSQL dans `DATABASE_URL` du fichier `.env`.
3. Mettre `DB_SSL=require`.

```env
DATABASE_URL=postgresql://postgres.xxxxx:MOT_DE_PASSE@db.xxxxx.supabase.co:5432/postgres
DB_SSL=require
```

> ⚠️ **Ne jamais committer `.env`** : il est exclu par `.gitignore`.

## Démarrage du backend

```bash
npx nx serve api
```

## Commandes utiles

| Tâche          | Commande                     |
| -------------- | ---------------------------- |
| Build          | `npx nx run api:build`       |
| Lint           | `npx nx lint api`            |
| Tests unitaires| `npx nx test api`            |
| Health check   | `GET http://localhost:3000/health` |

## Migrations (TypeORM)

Les migrations s'exécutent sur la base Supabase de développement.

```bash
npm run migration:show        # Afficher l'état des migrations
npm run migration:run         # Exécuter les migrations en attente
npm run migration:revert      # Annuler la dernière migration
npm run migration:generate    # Générer une migration depuis les entités
```

## Structure

```
apps/api/                     # Application NestJS
├── src/database/             # DataSource + migrations (001-schema, 002-seed)
├── src/modules/              # 16 modules DDD (auth, users, geo, market, …)
└── src/shared/               # Infra partagée (health, base entity)
docs/                         # Conception (bug.md, 06a, 06b, …)
infra/docker/                 # Stack locale optionnelle (docker-compose)
.github/workflows/            # CI backend (GitHub Actions)
```
