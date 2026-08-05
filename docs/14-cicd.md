# 4.5 — CI/CD & Workflow Git (TCHATCHA)

Version : 1.0 — Étape 4. Applicable dès la création du dépôt (Étape 5).
Références : `13-strategie-tests.md` (gates), `17-infrastructure.md` (envs).

---

## 1. Git Flow (branches)

```
main ──●───────●─────────────●── (production — toujours déployable)
        \     /             /
 release/1.0.0 ─●───●─────┘     (gel, hotfix autorisés)
          \   /
develop ──●──●──●──────────●──  (intégration continue)
          \    \          /
   feature/auth ├─...────┘      (1 branche = 1 module/1 flux — 10 §règles)
          \         /
   hotfix/paiement ─┘          (branche de `main`, fusion main+develop)
```

| Branche | Base | Fusion | Règles |
|---|---|---|---|
| `main` | — | merges release/hotfix only | protégée : 2 approbations, statuts verts, jamais de commit direct |
| `develop` | `main` | PR feature | protégée : 1 approbation, statuts verts |
| `feature/<module>-<fct>` | `develop` | PR → develop | courte vie (≤ 3 jours), rebase avant merge |
| `release/<version>` | `develop` | PR → main | gel : seuls fixes/blocants ; bump version + changelog |
| `hotfix/<version>` | `main` | PR → main | correctif urgent ; fusion aussi vers develop |

Règle de nommage : `feature/requests-quote`, `feature/mobile-paiement`, `fix/auth-refresh`.

## 2. Pull Requests

| Règle | Valeur |
|---|---|
| Template obligatoire | contexte (FCT/US/SCR), changements, tests, checklist, captures |
| Taille | ≤ 400 lignes (sinon découper) ; 1 PR = 1 fonctionnalité |
| Réviseurs | 2 approbations (dont 1 senior si backend/money) |
| Gates automatiques | lint, format, types, unit ≥ 80 %, intégration, SAST, secrets scan, build |
| Rebase | avant merge (historique linéaire ; pas de merge commits sur develop) |
| Draft | interdite si non prête ; `WIP:` dans le titre |
| CI sur PR | `affected` uniquement (Nx) : ne re-test que ce qui change |

## 3. Lint & Format

| Stack | Outil | Commande gate |
|---|---|---|
| Backend TS | ESLint (config partagée) + Prettier | `nx lint` / `nx format:check` |
| Flutter | `dart format` + `flutter analyze` (fatal-infos) | `flutter analyze --fatal-infos` |
| SQL (migrations) | `sqlfluff` | en CI |
| YAML/Dockerfile | actionlint + hadolint | en CI |
| Pre-commit | hooks husky : format + lint + tests rapides | local |

0 erreur = gate ; tout écart bloque le merge (NFR-Q2).

## 4. Build

| Artifact | Pipeline |
|---|---|
| Backend | `nx build api` (image Docker multi-stage, non-root) ; cache Nx + layers |
| Mobile Android | `flutter build apk --release` (split per abi) + AAB pour Play |
| Mobile iOS | `flutter build ios` (macOS runner) + Archive |
| Web admin | `flutter build web` → artefact statique (CDN) |
| Version de build | `--build-name` = version SemVer ; `--build-number` = CI run |

Caches : pub/npm, gradle, Nx, Flutter engine → builds < 3 min backend, < 15 min mobile.

## 5. Pipelines CI (GitHub Actions)

### 5.1 `ci-backend.yml` (PR + push develop/main)
```
checkout → setup node → npm ci (cache) → lint → format:check → test:unit
→ test:integration (testcontainers pg/redis/minio) → build → coverage gate
→ SAST (CodeQL) → trivy (image) → publish image :tag=sha-<short>
```
### 5.2 `ci-mobile.yml` (PR + push develop/main)
```
setup flutter (cache) → pub get → dart format --set-exit-if-changed
→ flutter analyze --fatal-infos → flutter test (unit+widget+golden)
→ build apk debug (smoke) → (PR) upload artifacts
```
### 5.3 `ci-e2e.yml` (nightly + release)
```
backend up (staging-like) → migrations → supertest e2e (FCT P0)
→ k6 smoke → mobile integration_test (matrix Android API 26 / 34) → rapports
```
### 5.4 `ci-admin-web.yml` (PR + release)

## 6. Déploiement (CD)

| Env | Déclencheur | Cible | Approbation |
|---|---|---|---|
| Dev | merge → develop | docker-compose dev (ou CI runner) | — |
| Staging | tag `vX.Y.Z-rc*` | serveur staging (miroir prod) | 1 approbation |
| Prod | tag `vX.Y.Z` (release) | serveurs prod (blue/green ou rolling) | 2 approbations + release notes |
| Rollback | déclencheur manuel | image précédente `vX.Y.Z-1` | 1 approbation ; ≤ 15 min (NFR-M2) |

Stratégie : **rolling avec healthcheck** (n / n-1) ; blue/green dès que le coût
le permet. Migrations : `migrate up` en pre-deploy (additive-first, zéro downtime),
`migrate down` documenté pour rollback (NFR-M1).

## 7. Versioning

| Règle | Valeur |
|---|---|
| Standard | **SemVer 2.0.0** : `MAJOR.MINOR.PATCH` |
| MAJOR | rupture API (rare, versionning API séparé — 12 §2) |
| MINOR | nouvelle fonctionnalité compatible |
| PATCH | correctif rétrocompatible |
| Pré-release | `v1.2.0-rc.1` (staging), `v1.2.0-beta.1` (bêta M5) |
| Sources | tags git + `package.json`/`pubspec.yaml` synchronisés |
| Changelog | généré depuis Conventional Commits (`CHANGELOG.md`) |

## 8. Conventional Commits (obligatoire)

```
<type>(<scope>): <description>

[corps : pourquoi + quoi]
[footer : BREAKING CHANGE / Closes #123]
```

| Type | Usage | Effet |
|---|---|---|
| `feat` | fonctionnalité | MINOR |
| `fix` | correction | PATCH |
| `docs` | documentation | — |
| `refactor` | sans changement de comportement | — |
| `test` | tests | — |
| `build`/`ci`/`chore` | tooling | — |
| `perf` | performance | PATCH |
| `BREAKING CHANGE:` | rupture | MAJOR |

Exemples :
- `feat(requests): envoyer un devis avec délai (FCT-009)` → `Closes #45`
- `fix(payments): dédupliquer les webhooks MoMo (uq_webhook_events)`
- `docs(api): figer les conventions v1 (12-api-blueprint)`

La description porte le FCT/US/SCR quand applicable (traçabilité 08).
Release notes = agrégation des commits `feat`/`fix` par version.

## 9. Garde-fous

1. **Aucun push direct** sur `main`/`develop` (protection branche + hooks).
2. **Aucun secret** dans le dépôt : `.env.*` gitignorés, secrets dans vault/SSM (17 §4) ; gitleaks bloque sinon.
3. `main` est toujours déployable (tag release obligatoire pour prod).
4. Toute règle contournée = incident de process, revue post-mortem.
5. Un développeur rejoint via le Developer Handbook (18) — inclut ce guide.
