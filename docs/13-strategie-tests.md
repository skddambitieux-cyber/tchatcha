# 4.4 — Stratégie de tests (TCHATCHA)

Version : 1.0 — Étape 4. Le **contrat qualité** : chaque PR, chaque release.
Aligne `09-nfr.md` (couvertures, NFR-Q1/Q2/Q5).

---

## 1. Pyramide de tests

```
        ╱ E2E ╲          — parcours critiques P0 (supertest + mobile)
       ╱───────╲
      ╱ Intégration ╲     — repos+DB, adaptateurs, outbox, ws
     ╱───────────────╲
    ╱  Unitaires      ╲   — domaine, use-cases, viewmodels, validators
   ╱────────────────────╲
   Base : lint + format + types (gates)
```

| Niveau | Cible | Exécution |
|---|---|---|
| 1. Lint/format/types | tout code | à chaque commit (pre-commit hook) + CI |
| 2. Unitaires | domain (entities, value objects, state machine), use-cases, controllers, viewmodels, validators, utils | à chaque PR (backend + mobile) |
| 3. Intégration | repositories TypeORM/PostGIS (testcontainers), adaptateurs (Redis, S3/MinIO, FCM mock), outbox transactionnelle, websockets | à chaque PR (modèle affecté) |
| 4. E2E | parcours P0 bout en bout : `publier → devis → négocier → réserver → payer → confirmer → avis` ; litige ; admin | nightly + avant chaque release |
| 5. Charge / sécurité / UX | voir §3-6 | programmée (pré-release + trimestriel) |

## 2. Couverture et règles

| Règle | Valeur |
|---|---|
| Domaine + use-cases (backend) | ≥ 80 % par module (seuil CI bloquant) |
| ViewModels + validators (mobile) | ≥ 80 % |
| E2E parcours P0 | 100 % des US P0 couvertes par ≥ 1 scénario GWT (08 §4) |
| Règles métier critiques | **100 %** : machine à états, transitions paiement, verrouillage créneaux, idempotence, rotations refresh |
| Toute correction de bug | test de régression d'abord (TDD régression) |
| Aucun merge | sans : couverture au seuil, lint 0, tests verts |
| Données de test | factories (lib `testing`) ; scénarios déterministes ; jamais de prod |

## 3. Tests unitaires (détail)

- **Backend (Jest)** : chaque `*.use-case.ts` testé (succès, chaque erreur, chaque
  transition illégale) ; entity/state machine en tableaux de cas ;
  value objects (Budget, Téléphone, Slot) en boundaries.
- **Mobile (flutter_test + mocktail)** : chaque controller (tous les états de
  `07l`), chaque viewmodel, `fromJson` de chaque modèle, validators.

## 4. Tests d'intégration (détail)

- **testcontainers** : PostgreSQL 16 + PostGIS + Redis + MinIO réels en CI.
- Cas obligatoires : verrouillage concurrent de créneau (2 requêtes simultanées),
  outbox = transactionnel (rollback → aucun événement), recherche géo (rayon,
  tri distance), refresh rotation (rejeu → révocation), webhook déduplication.

## 5. Tests E2E

- **Backend (supertest)** : scénarios GWT de `08-specification-fonctionnelle.md`
  (§4), numérotés par FCT ; base nettoyée entre tests ; assertion sur les
  événements émis (outbox) et les états finaux.
- **Mobile (integration_test)** : parcours P0 sur émulateur + device réel,
  throttling 3G (profile réseau), test du mode hors-ligne (file d'envoi).
- **Web admin** : parcours modération (validation → badge) et arbitrage.

## 6. Tests de charge

| Scénario (k6) | Charge | Seuil (NFR-S1/S2) |
|---|---|---|
| Lecture : accueil + recherche + fiche | 250 req/s mix 60/30/10 | P95 ≤ 350 ms ; erreurs < 0,5 % |
| Écriture : publication + devis + paiement | 50 req/s | P95 ≤ 600 ms ; < 0,5 % |
| Recherche géo dense | 100 req/s rayon 10 km | P95 ≤ 800 ms |
| Chat ws | 2 000 connexions simultanées | reconnection < 1 s |
| Pic Bénin 18h-22h | 2× la charge nominale | pas de dégradation > 2× |

Cadence : avant chaque release de fonctionnalité de volume, + revue trimestrielle.
Résultats archivés (comparatif).

## 7. Tests de sécurité

| Type | Outil | Cadence |
|---|---|---|
| SAST (analyse statique) | CodeQL (backend), Semgrep | chaque PR |
| Dépendances | `npm audit`, `dart pub outdated`, Dependabot | hebdo + alerte critique |
| Secrets scan | gitleaks | chaque push |
| DAST (API) | OWASP ZAP contre staging | avant chaque release |
| Tests d'intrusion ciblés | manuel : OTP brute-force, rate limit, idempotence, RBAC | trimestriel |
| Container scan | Trivy (images Docker) | chaque build image |
| Mobile | base de test device + Play Integrity (Android) | trimestriel |

Tout résultat bloquant = release gelée (NFR-K6).

## 8. Tests UX (maquettes 3.8 + M5 bêta)

| Type | Méthode | Attendue |
|---|---|---|
| Tests utilisateurs (maquettes 3.8) | 5-8 utilisateurs béninois par persona, modérés | avant développement final UI |
| Tests d'accessibilité | axe/flutter a11y + revue WCAG AA | chaque release majeure |
| Tests de perception | cold start, jank (DevTools), taille APK (NFR-P9) | chaque release |
| Tests de terrain (bêta M5) | 30 utilisateurs réels, 3G réel, collecte journaux | 2 semaines |

## 9. Boucle qualité (responsabilités)

| Acteur | Responsabilité |
|---|---|
| Développeur | unit + intégration + tests de régression ; couverture au seuil |
| Réviseur | vérifie les tests manquants sur les branches d'erreur |
| CI | gates automatiques (lint, types, unit, intégration, SAST, coverage) |
| Release manager | e2e + charge + DAST + diffusion notes de version |
| QA (1 personne à partir de M5) | parcours P0 manuels sur devices, scripts de recette |

## 10. Environnements de test

| Env | Usage | Données |
|---|---|---|
| Dev | développeurs, testcontainers locaux | fixtures |
| CI | identique à dev (containers) | fixtures |
| Staging | E2E + charge + DAST ; miroir prod | anonymisées + synthetic |
| Bêta | M5 sur le terrain | réelles (consentement) |
| Prod | surveillance (logs, traces, SLO) | réelles |

**Règle** : aucune donnée réelle hors prod ; toute donnée de test d'apparence réelle
est marquée (téléphones en 990 00 00 00, lieux « AGRIPRO »).
