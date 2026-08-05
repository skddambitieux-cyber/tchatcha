# 4.9 — Developer Handbook (TCHATCHA)

Version : 1.0 — Étape 4.
**Objectif (bug.md)** : tout nouveau développeur rejoint le projet sans dépendre
des fondateurs. Ce document est le point d'entrée unique ; les références pointent
vers les 28 documents de conception.

---

## 1. Bienvenue & contexte (15 min)

- **Produit** : TCHATCHA — plateforme de mise en relation de services au Bénin
  (Mode A : répertoire ; Mode B : publication de besoin → devis → réservation →
  paiement sécurisé → avis). Voir `bug.md` (PRD).
- **État d'avancement** : conception **complète et gelée** — étapes 1, 2, 3.7 ✅.
  Aucun code avant validation des blueprints (Étape 4, ce dossier) puis maquettes 3.8.
- **Règle d'or** : nous concevons d'abord, nous codons ensuite. Toute nouvelle
  idée passe par un document (ADR / US / 08) avant implémentation.

## 2. Carte de la documentation (à lire dans l'ordre)

| # | Doc | Contenu | Quand le relire |
|---|---|---|---|
| 01 | `01-architecture-globale.md` | vision, couches, modules, stack | avant toute tâche |
| 02 | `02-adr.md` + `02b` | 22 décisions (monolithe, providers, cache…) | avant tout choix d'architecture |
| 03 | `03-uml-diagrammes.md` + `03b` | diagrammes UML + C4 | comprendre les flux |
| 04 | `04-arborescence-projet.md` | structure du dépôt | avant de créer des fichiers |
| 05 | `05-roadmap-technique.md` | étapes, jalons, statut | orientation générale |
| 06 | `06-*` (5 fichiers) | schéma PG complet (69 tables, 17 schémas) | toute tâche DB |
| 07 | `07-*` (12 fichiers) | UX : flows, inventaire, design system, tokens, marque, US, interactions, wireframes, contrat Flutter par écran | toute tâche UI |
| 08 | `08-specification-fonctionnelle.md` | FCT ↔ US ↔ SCR ↔ API ↔ module + GWT | avant d'implémenter une FCT |
| 09 | `09-nfr.md` | exigences non fonctionnelles **contractuelles** | avant toute release |
| 10 | `10-blueprint-backend.md` | contrat des 11 modules NestJS | toute tâche backend |
| 11 | `11-blueprint-flutter.md` | pattern écran, core, offline | toute tâche mobile |
| 12 | `12-api-blueprint.md` | conventions REST **figées v1** | toute API |
| 13 | `13-strategie-tests.md` | pyramide, couvertures, charge/sécu/UX | avant d'écrire des tests |
| 14 | `14-cicd.md` | Git Flow, PR, commits, déploiement | tous les jours |
| 15 | `15-securite.md` | threat model, RBAC, JWT, OTP, fraude, RGPD | tâches sensibles |
| 16 | `16-observabilite.md` | logs, métriques, traces, SLO, alertes | ajout de feature |
| 17 | `17-infrastructure.md` | docker, envs, secrets, backup, scaling | déploiement |
| 18 | **ce fichier** | comment travailler | tous les jours |

## 3. Environnement de développement (Jour 1)

### 3.1 Prérequis
- Git, Node.js 20 LTS, npm, Docker + Docker Compose, Nx CLI (`npx nx`),
  Flutter 3.x stable (canal stable), Android Studio ou VS Code (extensions
  Dart/Flutter, ESLint, Prettier, Docker).
- Accès : repo GitHub (main/develop), vault (accès secrets dev), Slack/WhatsApp
  équipe, Sentry (projet dev), Grafana (lecture staging).

### 3.2 Démarrage backend
```
git clone <repo> && cd tchatcha/backend
npm ci
cp .env.example .env.dev && # compléter avec les secrets vault
docker compose up -d pg redis minio          # infra locale
npx nx serve api                              # API sur :3000
npx nx test api                               # tests
```
- Migrations : `npx nx run database:migrate` (1 migration = 1 module).
- Seed : `npx nx run database:seed` (fixtures : pays BJ, catégories, 20 pros).

### 3.3 Démarrage mobile
```
cd mobile
flutter pub get
flutter run -t apps/client/lib/main.dart --dart-define=API_URL=http://localhost:3000
flutter test
```

## 4. Comment ajouter une fonctionnalité (checklist obligatoire)

1. **Lire le contrat** : FCT dans `08` (GWT), US dans `07g`, écrans dans `07k` (SCR), DTO dans `10`.
2. **Vérifier le schéma** : table existante dans `06a/06b` ? Sinon **nouvelle migration + mise à jour du doc 06** (process ADR si changement de design).
3. **Créer la branche** : `feature/<module>-<fct>` depuis `develop` (14 §1).
4. **Backend** : use-case → port → adapter → controller + DTO (10) ; événement si nécessaire (Outbox).
5. **Mobile** : controller → screen (11 §3) ; widgets depuis `core/widgets` (07c) ; tokens `07d` ; textes ARB (07f).
6. **Tests** : unit du use-case/controller (≥ 80 % module), widget test, GWT → e2e (13).
7. **Instrumenter** : span OTel + métrique métier (16 §2.3).
8. **Commit** Conventional Commits avec FCT/US/SCR (14 §8) → PR (template, 2 approbations).
9. **Vérifier** : pas de régression (CI), pas de secret, pas de PII dans les logs, NFR respectés.

## 5. Standards de code (extraits — voir 10/11 §règles)

- Backend : Clean Architecture 4 couches ; interdiction d'importer `infrastructure` depuis `domain` ; use-cases sans décorateurs NestJS ; `class-validator` sur les DTO.
- Mobile : Riverpod ; widget stateless ; aucun `setState` métier hors widget ; zéro couleur hard-codée (tokens) ; zéro texte hard-codé (ARB) ; traçabilité `US/SCR` en tête de fichier.
- Langues : code et commits en anglais ; documentation produit en français.
- Format : Prettier / dart format (hooks husky).

## 6. Git & PR (résumé — 14)

- Branches : `feature/*` → `develop` → `release/*` → `main`. Jamais de push direct.
- Commit : `feat(requests): publier un besoin avec photos (FCT-008) #42`.
- PR ≤ 400 lignes, template obligatoire, 2 approbations, gates CI verts.
- Tags SemVer + `CHANGELOG.md` auto.

## 7. Tests (résumé — 13)

| Je travaille sur | Je lance |
|---|---|
| Backend module X | `npx nx test X` puis `npx nx e2e X` |
| Mobile flux Y | `flutter test test/<flux>` |
| Tout avant merge | CI (lint, unit, intégration, SAST) |
| Avant release | e2e P0 + k6 smoke + DAST |

Couverture : unitaires ≥ 80 % (module), règles critiques 100 %, toute correction = test de régression d'abord.

## 8. Déploiement (résumé — 14/17)

- Développeur : merge → develop → déployé en dev automatiquement.
- Tag `vX.Y.Z-rc.N` → staging (e2e + DAST automatiques).
- Tag `vX.Y.Z` → prod (2 approbations, release notes, rolling + healthcheck).
- Rollback : ré-deployer l'image précédente (≤ 15 min).
- **Jamais** de migration destructive ; migrations additive-first, `down` inclus.

## 9. Incidents & runbooks (résumé — 16/17)

1. Alerte Sev 1/2 → garde on-call (rota Slack).
2. Vérifier le dashboard « 01 Santé » (trace_id depuis Sentry/erreur API).
3. Suivre le runbook de l'incident (tableau §10 de `17`), sinon escalade.
4. Post-mortem < 72 h : chronologie, SLO impactés, actions, alertes manquantes.
5. Ne jamais « réparer » à la hâte : PR + tests de régression (13 §2).

Incidents types : API down (failover), PG down (promote replica), provider paiement
(bascule + tableau SCR-127), corruption (PITR), données PII (procédure légale 15 §9).

## 10. Rôles & responsabilités

| Rôle | Responsabilités |
|---|---|
| Chaque dev | qualité de son code, tests, sécurité de base, docs à jour |
| Senior (1+) | revue des PR money/security, architecture, ADR |
| Dev lead | arbitrages techniques, roadmap, gardien des conventions |
| QA (à partir de M5) | recettes manuelles P0, scripts, retours UX terrain |
| On-call | alerte Sev 1/2, runbooks, post-mortem |
| Fondateurs | décisions produit (validation US/FCT), accès prod, budgets |

## 11. Glossaire (extraits — complet dans `08` §8)

| Terme | Définition |
|---|---|
| Mode A / Mode B | répertoire de pros / publication de besoin avec devis |
| Besoin (request) | annonce d'un client, statuts OPEN→…→REVIEWED (06 §10) |
| Devis (quote) | réponse d'un pro à une demande |
| Booking | réservation de créneau + paiement |
| Trust Score | note 0-5 calculée (ajustement 2) |
| Outbox | file transactionnelle d'événements inter-modules |
| FCT / US / SCR | fonctionnalité (08) / user story (07g) / écran (07b/07k) |
| P0 | périmètre MVP (34 US) |

## 12. Première semaine type (nouvel arrivant)

| Jour | Programme |
|---|---|
| 1 | Lire 01, 04, 05, 18 §1-3 ; setup complet ; dev env vert |
| 2 | Lire 02 (ADR), 06 (schéma) ; PR « docs » : corriger 1 incohérence trouvée |
| 3 | Lire 10, 12, 14 ; prendre une issue `good first issue` (module simple : categories) |
| 4 | Lire 11, 07 (tokens/wireframes) ; PR mobile (écran simple : SCR-006) |
| 5 | Lire 13, 15, 16 ; déploiement staging complet ; participation à la rota |

**Vérification finale** : « je sais déployer, tester, corriger, et où trouver chaque
réponse » → l'onboarding est réussi.

---

*Ce handbook vit avec le projet : toute nouvelle procédure ou décision ajoute sa
référence ici (lien vers le document), jamais du contenu dupliqué.*
