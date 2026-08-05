# 5.3 — Préparation technique (scaffolds) — TCHATCHA

Version : 1.0 — Étape 5 (Lot 7, exécuté en dernier après les maquettes/prototype).
Fournit le **point de départ du développement MVP** (Étape 6, phase 6.1 —
Fondations) : ensemble de fichiers de configuration réels, prêts à committer.

> **Rappel** : aucun code de développement n'est créé ici. Il s'agit de
> squelettes de configuration (infra, CI, git) référencés par les documents
> de conception (04-arborescence-projet.md, 17-infrastructure.md, 14-cicd.md).

---

## 1. Contenu livré

| Fichier | Rôle | Source |
|---|---|---|
| `infra/docker/docker-compose.yml` | Stack locale : PostgreSQL 16 + PostGIS, Redis, MinIO (S3) | 17-infrastructure, 06 |
| `infra/docker/api.Dockerfile` | Image backend NestJS (multi-stage) | 17, 14 |
| `.github/workflows/ci-backend.yml` | CI backend : lint, tests unitaires, build, e2e (testcontainers) | 14-cicd, 13 |
| `.github/workflows/ci-mobile.yml` | CI Flutter : analyze, test, build Android (debug) | 14, 11 |
| `.env.example` | Variables d'environnement (back) documentées | 17, 09 |
| `.gitignore` | Ignorés racine (env, builds, caches) | 14 |
| `.editorconfig` | Style d'édition partagé (tabs/spaces) | 14 |
| `package.json` (racine) | Scripts + Husky + commitlint (Conventional Commits) | 14 |
| `.commitlintrc.json` | Règles Conventional Commits | 14 |
| `.husky/pre-commit*` | Hook pre-commit (lint + tests stables) | 14 |
| `.github/PULL_REQUEST_TEMPLATE.md` | Template de PR | 14, 18 |

## 2. Décisions sous-jacentes (rappel des ADR / docs)

- **PostgreSQL 16 + PostGIS** : géolocalisation native (GIST, rayon, rang) — 06/07.
- **Redis** : cache, sessions/OTP store, files de tâches (anti double-réservation) — 06/02b.
- **MinIO** : compatible S3 en local ; **R2 (Cloudflare)** ciblé en prod pour le média — 17/02b. Single adapter `libs/storage`.
- **OTP SMS** : providers MTN/Moov via adapter `libs/sms` (asciisms, messagevia, ...) — 15/10.
- **Conventional Commits + Git Flow** : SemVer, PR obligatoires — 14-cicd.
- **Nx monorepo** : `backend/` NestJS. Apps Flutter séparées dans `mobile/` — 04.

## 3. Convention des valeurs chiffrées

- Les `xxxx` dans `.env.example` sont des **placeholders** ; le contenu réel est
  à remplir localement (`cp .env.example .env`) et en CI via secrets GitHub.
- PostgreSQL : port `5432`, database `tchatcha`, user `tchatcha`.
- MinIO : port `9000` (API), `9001` (console), bucket `tchatcha` + `tchatcha-private`.
- Redis : port `6379`, valeur gestion retries.

## 4. Mise en route (Étape 6, phase 6.1)

1. `git init` (ou cloner le repo) → ajouter les fichiers de ce lot.
2. `cp .env.example .env` → remplir les valeurs locales.
3. `docker compose -f infra/docker/docker-compose.yml up -d` → pg+redis+minio.
4. Init MinIO : créer les buckets `tchatcha` et `tchatcha-private`.
5. `npm install` et hooks Husky : `npx husky install` (ou `npm run prepare`).
6. Vérifier la CI Green sur le premier push (workflows ci-backend / ci-mobile).

## 5. Vérifications fournies

- [ ] `docker compose config` valide la syntaxe compose.
- [ ] `npx commitlint --from HEAD~1` teste la convention des commits.
- [ ] Les workflows GitHub Actions se déclenchent sur `push`/`PR`.
- [ ] `.editorconfig` reconnu par les éditeurs (tabs : 2 espaces, LF).

## 6. Log des ajustements (traçabilité Roadmap / jalons)

- Ce lot **clôt l'Étape 5** (7 lots livrés) → gate M5 (prototype validé) avant Étape 6.
- Les maquettes (49) + prototype (2 parcours) sont visibles depuis `docs/maquettes/index.html`.
- Toute divergence constatée dans les scaffolds doit être reflétée dans
  `17-infrastructure.md` / `14-cicd.md` (source de vérité).