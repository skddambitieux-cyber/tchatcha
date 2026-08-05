# Architecture Globale — Plateforme de Services de Proximité

Version : 1.0 — Étape 1 (document de validation, aucun code écrit)

---

## 1. Vision technique

La plateforme est conçue comme un **écosystème de modules indépendants**, structuré selon les principes de la **Clean Architecture** et du **Domain Driven Design (DDD)**.

Principes directeurs :

| Principe | Application |
|---|---|
| Modularité | Chaque domaine métier est un module autonome. Un module peut être extrait en microservice sans réécriture. |
| Indépendance des couches | Le code métier (domaine) ne dépend jamais de la technologie (NestJS, PostgreSQL, etc.). |
| SOLID | Single responsibility, interfaces, injection de dépendances. |
| Repository Pattern | L'accès aux données passe par des interfaces, jamais par l'ORM directement. |
| CQRS (si nécessaire) | Les lectures lourdes (recherche, statistiques) peuvent être séparées des écritures. |
| Contrat API stable | Les modules communiquent entre eux par des contrats (interfaces), pas par leurs implémentations. |

---

## 2. Vue d'ensemble de l'architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENTS                                   │
│  App Client (Flutter)   App Pro (Flutter)   App Livreur (Flutter)│
│  Dashboard Entreprise (Web)   Dashboard Admin (Web)               │
│  Site vitrine + portail (Web)                                    │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTPS / REST JSON
┌──────────────────────────────▼──────────────────────────────────┐
│                  API GATEWAY (NestJS)                            │
│  Authentification (JWT + OTP) · Rate limiting · Validation       │
│  Routage vers les modules · Permissions · Documentation Swagger  │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│                 MODULES MÉTIER (NestJS monorepo)                 │
│                                                                  │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐    │
│  │  Auth &    │ │  Users &   │ │  Search &  │ │ Messaging  │    │
│  │  OTP       │ │  Pros      │ │  Geoloc    │ │ & Notifs   │    │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘    │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐    │
│  │  Requests  │ │  Reviews   │ │  Admin     │ │  Payments  │    │
│  │  (besoins) │ │  & Ratings │ │  (P2)      │ │  (P2)      │    │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘    │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐    │
│  │ Restaurants│ │  Orders &  │ │   AI       │ │   IA       │    │
│  │  (P2)      │ │ Deliveries │ │  (P3)      │ │  (future)  │    │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘    │
└──────┬───────────────┬──────────────┬──────────────┬────────────┘
       │               │              │              │
┌──────▼─────┐ ┌───────▼────┐ ┌──────▼─────┐ ┌──────▼─────┐
│ PostgreSQL │ │   Redis    │ │ S3 (médias)│ │ Firestore/ │
│ (source de │ │ (cache,    │ │ Cloudflare │ │ FCM        │
│  vérité)   │ │ sessions)  │ │ R2         │ │ (notifs)   │
└────────────┘ └────────────┘ └────────────┘ └────────────┘
```

---

## 3. Les couches (Clean Architecture)

Chaque module suit le même découpage en 4 couches :

```
┌────────────────────────────────────────────────┐
│ 1. PRESENTATION (controllers, DTOs, guards)    │  ← dépend de l'application
│    — gère HTTP, validation, permissions        │
├────────────────────────────────────────────────┤
│ 2. APPLICATION (use-cases, services, CQRS)     │  ← dépend du domaine
│    — orchestre les cas d'usage métier          │
├────────────────────────────────────────────────┤
│ 3. DOMAIN (entités, value objects, interfaces) │  ← cœur, AUCUNE dépendance
│    — règles métier pures, jamais d'ORM/HTTP    │
├────────────────────────────────────────────────┤
│ 4. INFRASTRUCTURE (repositories, adapters)     │  ← implémente le domaine
│    — TypeORM/Prisma, Redis, S3, FCM, Maps      │
└────────────────────────────────────────────────┘
```

Règles de dépendance :
- Le **domaine** ne connaît ni NestJS, ni PostgreSQL, ni quoi que ce soit d'externe.
- L'**infrastructure** dépend du domaine (implémente ses interfaces), jamais l'inverse.
- Tout échange vers l'extérieur (API, base, files, push) passe par une **interface du domaine**.

Conséquence : on peut changer PostgreSQL → MongoDB, NestJS → Express, ou ajouter
une interface web, sans toucher au code métier.

---

## 4. Les modules (domaines métier)

Chaque module est autonome : son code, ses migrations, ses tests.

### MVP (Phase 1)

| Module | Responsabilités principales |
|---|---|
| `auth` | Inscription, connexion, JWT, refresh token, OTP SMS, rôles |
| `users` | Profils client, paramètres, favoris, adresses, photos |
| `professionals` | Profils pro, catégories, services, portfolio, horaires, badge vérifié, disponibilités |
| `categories` | Arborescence des catégories et sous-catégories |
| `geolocation` | Positions GPS, reverse geocoding, calcul de distance (PostGIS) |
| `search` | Recherche multi-critères (mot-clé, ville, quartier, distance, note, tarif, disponibilité) |
| `requests` | Publication de besoins (Mode B), réponses des pros, sélection |
| `messaging` | Chat en temps réel, conversations, fichiers, position |
| `notifications` | Notifications push FCM, in-app, préférences |
| `reviews` | Avis post-prestation, notes multi-critères, modération |
| `admin` | Dashboard, validation, signalements, statistiques, gestion utilisateurs |

### Phase 2

| Module | Responsabilités |
|---|---|
| `restaurants` | Restaurants, menus, produits, horaires |
| `orders` | Commandes, statuts, panier, facturation |
| `deliveries` | Livreurs, courses, assignation, suivi GPS temps réel |
| `payments` | MTN MoMo, Moov Money, espèces, transactions, rapprochement |

### Phase 3 / futur

| Module | Responsabilités |
|---|---|
| `ai` | Recherche intelligente, recommandations, suggestion de prix, analyse d'avis, anti-fraude |
| `subscriptions` | Abonnements premium pros |
| `advertising` | Publicité, promotions sponsorisées |
| `multitenancy` | Gestion multi-pays (Togo, Burkina, Niger…) |

---

## 5. Communication inter-modules

Deux cas possibles selon la maturité du projet :

**Aujourd'hui (modular monolith)**
- Tous les modules dans un seul repo NestJS (monorepo Nx).
- Communication directe en mémoire via les services de domaine.
- Base PostgreSQL unique, schémas par module (ex. `auth.*`, `requests.*`).
- Fiable, déployable en 1 processus, simple pour le MVP.

**Demain (si besoin de scale)**
- Extraction module par module en microservices NestJS.
- Communication par événements (Redis Streams / RabbitMQ) ou API interne.
- Chaque service possède SA base de données (pas de partage).

Cette transition est possible **sans réécriture** car :
- les modules ne se connaissent pas entre eux (couplage faible) ;
- chaque module a ses propres tables et migrations ;
- les contrats sont des interfaces pures.

---

## 6. Décisions technologiques clés

| Sujet | Choix | Raison |
|---|---|---|
| Langage backend | TypeScript / NestJS | Typé, structuré, DI natif, monorepo Nx |
| ORM | TypeORM (ou Prisma) | Migrations versionnées, compatible PostGIS |
| Base de données | PostgreSQL 16 + PostGIS | Géolocalisation native, JSONB, robuste |
| Cache / files | Redis | Cache, OTP, file d'attente, présence chat |
| Médias | S3 compatible (Cloudflare R2) | Coût faible, pas de vendor lock-in |
| Carto | OpenStreetMap + MapLibre | Gratuit, adapté au Bénin, GPS temps réel |
| Push | Firebase Cloud Messaging | Multi-plateforme, gratuit |
| SMS OTP | API locale (ex. SMS Bénin/Intouch) | À évaluer en Phase 1 |
| Auth | JWT access (15 min) + refresh (30 j) + OTP | Sécurité mobile standard |
| Tests | Jest (unit), Supertest (e2e) | Stack NestJS standard |
| CI/CD | GitHub Actions → Docker → déploiement | À valider au démarrage du code |

---

## 7. Sécurité

- Authentification JWT + refresh token rotatif (détection de vol).
- OTP SMS obligatoire à l'inscription (lutte anti-faux comptes).
- Mots de passe : bcrypt (coût 12).
- Rate limiting par IP et par compte (anti-spam, anti-bruteforce).
- Validation stricte des entrées (class-validator).
- Chiffrement TLS partout ; chiffrement des données sensibles (téléphone, CIN).
- Rôles et permissions par garde (guard) : `client`, `professional`, `deliverer`, `admin`.
- Journalisation d'audit pour les actions sensibles.
- Vérification d'identité (CIN + selfie) soumise à modération manuelle avant badge.

---

## 8. Évolutivité (plusieurs millions d'utilisateurs)

- **Indexation** : index pertinents sur toutes les clés de recherche (voir Étape 2).
- **Cache** : Redis pour les hot data (catégories, pros populaires, sessions).
- **Lecture/écriture** : réplicas de lecture PostgreSQL dès que nécessaire.
- **Search** : PostgreSQL/PostGIS d'abord ; bascule vers Elasticsearch si les volumes l'exigent (derrière l'interface `search` du domaine, sans impact métier).
- **Médias** : CDN (Cloudflare) devant le S3.
- **Stateless** : le backend ne garde aucun état serveur (scalable horizontalement).
- **Multi-pays** : prévu dès le départ via colonnes `country` et module de configuration.

---

## 9. Frontend (Flutter) — structure de travail

Le PRD recommande 4 apps + 2 web. Recommandation technique :

- **Monorepo Flutter** avec un package `core` partagé :
  - `core` : thème, widgets communs, API client, modèles, localisation, state management.
  - `app_client` : app grand public.
  - `app_pro` : app professionnel.
  - `app_deliverer` : app livreur (Phase 2).
  - Réutilisation du core → cohérence UI et gain de temps énorme.
- **State management** : Riverpod (simple, testable, moderne).
- **Web dashboards** (admin/entreprise) : Vue ou Flutter Web (à trancher à l'Étape 3).

---

## 10. Ce qui sera livré ensuite

| Étape | Livrable |
|---|---|
| 2 | Schéma PostgreSQL complet (tables, relations, index) — voir `02-schema-base.md` |
| 3 | Design UX/UI complet (tous les écrans) — voir `03-ux-ui.md` |
| 4 | Documentation API (endpoints, payloads, Swagger) — voir `04-api.md` |
| 5 | Développement MVP (après validation de tout ce qui précède) |
