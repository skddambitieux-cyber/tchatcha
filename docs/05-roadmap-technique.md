# Roadmap technique

Plan d'exécution de la conception jusqu'au déploiement. Chaque étape produit un
livrable validable. **Aucun code tant que les étapes 1 à 5 (conception) ne sont
pas validées.**

---

## Étape 1 — Architecture (livrée)

✅ Livrables :
- `01-architecture-globale.md` — Clean Architecture, modules, décisions
- `02-adr.md` — 22 Architecture Decision Records
- `02b-revue-architecture.md` — revue des 15 points (multi-pays, i18n, providers, monitoring…)
- `03-uml-diagrammes.md` — diagrammes UML
- `03b-diagrammes-c4.md` — C4 Context/Container/Component + logique + physique + flux
- `04-arborescence-projet.md` — arborescence complète

**Validation :**
- [x] Architecture modulaire (DDD / Clean Architecture) approuvée
- [x] Choix monolithe modulaire validé (ADR-001)
- [x] Arborescence approuvée
- [x] Revue d'architecture (15 points) intégrée — en attente de validation définitive

---

## Étape 2 — Conception de la base de données

📄 Livrables (conception complète PostgreSQL) :
- `docs/06-schema-base.md` — conventions, types, extensions, MCD/MLD, machine à états marketplace, stratégie de performance (index/partitionnement/archivage)
- `docs/06a-tables-mvp-core.md` — 27 tables détaillées (auth, users, geo, pros, ai)
- `docs/06b-tables-mvp-market.md` — 29 tables détaillées (market, pay, review, msg, notif, admin, audit)
- `docs/06c-tables-phase2-3.md` — 11 tables (food, delivery, billing) + récapitulatif 67 tables

| Sous-tâche | Détail |
|---|---|
| Diagramme des tables | 56 tables MVP + 11 Phase 2/3, par domaine métier |
| Relations | FK, cardinalités, contraintes d'intégrité, règles de suppression |
| Index | B-tree, GIN (full-text/trgm), GiST (PostGIS), partiels, composites justifiés |
| Optimisations | Partitionnement futur documenté, archivage, agrégats maintenus, keyset |
| Multi-millions | Stratégie complète (index + cache + lecture/écriture) |
| Migrations | 1 migration = 1 module, versionnées, down inclus |

**Validation :**
- [x] Schéma complet approuvé (tables, index, relations) — y compris `06d-revue-schema.md` (7 ajustements : Event Sourcing léger, Trust Score, recherche rapide, anti double-réservation, média générique, RGPD, zones géo)
- [x] Convention de nommage approuvée
- [x] Machine à états marketplace validée

---

## Étape 3 — Product Design / UX Architecture (livrée)

📄 Livrables (méthode Product Design — bug.md) :
- `docs/07-ux-ui.md` — document maître (méthode, traçabilité US → écran)
- `docs/07a-product-flows.md` — flows des 4 personas (3.1)
- `docs/07b-inventaire-ux.md` — inventaire complet : 76 écrans, 15 dialogues, 10 sheets, 7 wizards, 20 push, 8 emails, 6 SMS, 8 états (3.2)
- `docs/07c-design-system.md` — composants, états, accessibilité (3.3)
- `docs/07d-design-tokens.md` — couleurs, radius, shadows, spacing, typo, motion, breakpoints (3.4)
- `docs/07e-identite-marque.md` — marque TCHATCHA : mission, valeurs, promesse, badge « Vérifié TCHATCHA » (3.5)
- `docs/07f-ux-writing.md` — microcopies complètes (3.6)
- `docs/07g-user-stories.md` — backlog 63 US traçables (base 3.8)
- `docs/07h-interactions.md` — gestes, navigation, feedback, carte, upload, offline (3.6 bis)
- `docs/07i-wireframes.md` — wireframes flows Client (SCR-001-005, 019-028, 031, 011) (3.7)
- `docs/07j-wireframes-pro-admin.md` — wireframes flows Pro + Admin (SCR-070-086, 121-128) (3.7)
- `docs/07k-wireframes-restants.md` — wireframes complémentaires (SCR-010, 012-018, 029-030, 032-035, 084, 087-090, 120, 123, 125-127, 129) — couverture 3.7 : 100 % (66 écrans MVP)
- `docs/07l-flutter-documentation.md` — contrats techniques par écran (Widget, route, controller, use cases, repos, entités, états, événements)
- `docs/08-specification-fonctionnelle.md` — Phase 4 : FCT ↔ US ↔ SCR ↔ API ↔ module (matrice + GWT)

**Validation :**
- [x] Parcours utilisateur validés (flows 3.1)
- [x] Marque (nom TCHATCHA, palette, slogan, badge vérifié) validée
- [x] Design Tokens approuvés (deviennent `core/theme` Flutter)
- [x] Backlog US validé (63 US, P0 = 34)
- [x] Wireframes 3.7 approuvés (66 écrans MVP livrés : 07i/07j/07k) — **gelés par l'utilisateur (bug.md)**

Les sous-étapes reportées (maquettes haute fidélité + prototype) ont été
réalisées à l'**Étape 5** (conception finale) — voir ci-dessous.

---

## Étape 4 — Blueprints techniques, NFR & stratégie (livrée)

✅ Livrables (bug.md §Étape 4) :
- `docs/09-nfr.md` — exigences non fonctionnelles contractuelles (perf, dispo, charge, sécu, accessibilité, compat, sauvegardes, reprise, maintenance, qualité, monitoring)
- `docs/10-blueprint-backend.md` — contrat des 11 modules NestJS (responsabilités, use-cases, services, ports, adaptateurs, événements, DTO, validations, erreurs, permissions)
- `docs/11-blueprint-flutter.md` — pattern par écran, core, offline, navigation, tests
- `docs/12-api-blueprint.md` — conventions REST v1 figées (pagination keyset, filtres, recherche, tri, versionnement, erreurs, sécurité, limites, idempotence, webhooks)
- `docs/13-strategie-tests.md` — unitaires, intégration (testcontainers), e2e, charge (k6), sécurité, UX
- `docs/14-cicd.md` — Git Flow, branches, PR, lint/format, build, déploiement, SemVer, Conventional Commits
- `docs/15-securite.md` — Threat Model STRIDE, OWASP Top 10, RBAC, JWT, OTP, rate limiting, audit, fraude, loi 2017-20/RGPD
- `docs/16-observabilite.md` — logs (Loki), métriques (Prometheus), traces (OTel), SLO, alertes, dashboards
- `docs/17-infrastructure.md` — Docker, environnements, secrets, backups PITR, scaling, reverse proxy, CDN
- `docs/18-developer-handbook.md` — onboarding complet, checklist de feature, runbooks, glossaire
- `docs/08-api.md` — documentation API détaillée (endpoint par endpoint, payloads, exemples) + matrice FCT ↔ US ↔ SCR ↔ API ↔ module

**Validation :**
- [x] Blueprints techniques + NFR livrés (M3b)
- [ ] API détaillée validée (M4) — pendante, prévue avec l'Étape 5 finale
- [ ] Décisions à acter pour le développement : hébergeur, réplica PG, fournisseur SMS, websocket (ADR)

---

## Étape 5 — Conception finale : règles, catalogue, pilote, maquettes & prototype (livrée)

Conception exécutive **avant tout code** (7 lots validés — bug.md) :

✅ Livrables :
- `docs/19-business-rules.md` — Lot 1 : ~50 règles métier BR-XXX (badge, Trust Score, sanctions, demandes/devis, no-show, escrow, litiges, remboursements, avis, RGPD) + tableau d'impacts + table de traçabilité
- `docs/20-catalogue-benin.md` — Lot 2 : catalogue des métiers (4 groupes, 15 sous-catégories) + attributs `jsonb`
- `docs/21-plan-pilote.md` — Lot 3 : plan pilote Cotonou–Abomey-Calavi (objectifs, 4 phases, KPIs, Go/No-Go)
- `docs/22-identite-visuelle.md` — Lot 4a : identité visuelle appliquée (logo, app icon, splash, typo, illustrations, badge)
- `docs/maquettes/` — Lot 4b : **49 maquettes haute fidélité** (16 Client, 10 Pro, 5 Livreur, 6 Admin, 6 erreurs) HTML/CSS traçables SCR→US, Design System `css/tchatcha.css`
- `docs/24-prototype-interactif.md` — Lot 5 : prototype interactif + 2 parcours cliquables (Client 8 étapes, Marketplace 7 étapes) + critères d'acceptation
- `docs/25-preparation-technique.md` — Lot 7 : préparation technique (scaffold Docker, CI GitHub Actions, .env.example, .gitignore, .editorconfig, hooks, template PR) — voir infra

**Validation attendue (Gate avant Étape 6) :**
- [x] Lots 1 → 5 livrés et cohérents (traçabilité US/SCR/FCT/BR)
- [ ] Prototype validé par utilisateurs pilotes (critères `24-prototype-interactif.md` §6)
- [ ] Corrections intégrées au backlog MVP

---

## Étape 6 — Développement MVP

🔨 Dès que les étapes 1 à 5 (conception) sont validées.

| Phase de dev | Contenu |
|---|---|
| 6.1 — Fondations | Monorepo Nx, config, docker-compose (pg+PostGIS, redis, minio), CI, tests |
| 6.2 — Auth | Inscription OTP, connexion, refresh, rôles |
| 6.3 — Users & Pros | Profils, catégories, portfolio, vérification manuelle |
| 6.4 — Géoloc & Search | PostGIS, recherche multi-critères |
| 6.5 — Demandes | Mode B complet (publication → réponses → sélection) |
| 6.6 — Chat | Conversations, messages, fichiers |
| 6.7 — Avis | Post-prestation, multi-critères |
| 6.8 — Admin | Dashboard, validation, signalements, statistiques |
| 6.9 — App Client Flutter | Tous les écrans validés à l'Étape 5 |
| 6.10 — App Pro Flutter | Dashboard pro et flux de réponse |
| 6.11 — Beta fermée | Test réel au Bénin, retours, corrections |

**Critères de sortie MVP :** le parcours complet d'un utilisateur fonctionne de
bout en bout sur Android + iOS, avec tests et CI verts.

---

## Étape 7 — Phase 2

- Restaurants, menus, commandes
- Livreurs, suivi temps réel (maquettes livreur déjà livrées à l'Étape 5)
- Paiements MTN MoMo / Moov Money (test sandbox → production)
- Notifications avancées

---

## Étape 8 — Phase 3

- IA : recherche intelligente, recommandations, estimation de prix, analyse d'avis, anti-fraude
- Statistiques avancées, publicité, abonnements premium
- Site web complet, API publique
- Nouveaux pays (Togo, Burkina, Niger…)

### Décisions produit post-FCT-016

Le pilote suit un modèle hybride : recherche autonome par le client et parcours
assisté par TCHATCHA, avec choix final du client. Dans les deux cas, devis,
réservation, paiement, protection, litige et avis restent internes à TCHATCHA.
Le pilote est limité au couloir Cotonou–Abomey-Calavi.

Les éléments indispensables au pilote restent prioritaires, puis vient le
parcours mobile minimal. Le Journal TCHATCHA complet, ses publications
sponsorisées et sa monétisation sont postérieurs à la validation du besoin
terrain ; une version légère n’est admise que si elle reste hors chemin critique.
Voir `docs/43-modele-operationnel-monetisation-pilote.md`.

---

## Jalons (gros plan)

| Jalon | Échéance indicative | Critère |
|---|---|---|
| M1 | ✅ | Architecture validée (Étape 1) |
| M2 | ✅ | Base de données validée (Étape 2) |
| M3 | ✅ | Product Design validée (Étape 3) — wireframes 3.7 gelés |
| M3b | ✅ | Blueprints techniques + NFR livrés (Étape 4) |
| M4 | — | API détaillée validée (Étape 4 bis / décision Étape 5) |
| M4b | ✅ | Conception finale livrée (Étape 5) : règles, catalogue, pilote, identité, 49 maquettes, prototype, préparation technique |
| M5 | — | Prototype validé (Gate) → lancement du développement MVP |
| M6 | — | MVP bêta fermée au Bénin (Étape 6) |
| M7 | — | MVP public (stores Android/iOS) |
| M8 | — | Phase 2 en production (Étape 7) |

Les échéances seront fixées après validation de la conception (M5).
