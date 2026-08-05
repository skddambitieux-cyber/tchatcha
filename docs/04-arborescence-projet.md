# Arborescence du projet

Monorepo : backend NestJS (Nx) + apps Flutter. Structure cible à partir de l'Étape 5.

```
tchatcha/
│
├── docs/                                # Toute la conception (ce dossier)
│   ├── 01-architecture-globale.md
│   ├── 02-adr.md
│   ├── 03-uml-diagrammes.md
│   ├── 04-arborescence-projet.md        # ce fichier
│   ├── 05-roadmap-technique.md
│   ├── 06-schema-base.md                # Étape 2
│   ├── 07-ux-ui.md                      # Étape 3
│   └── 08-api.md                        # Étape 4
│
├── backend/                             # Monorepo NestJS (Nx)
│   ├── apps/
│   │   ├── api/                         # Application principale (bootstrap, gateway)
│   │   │   ├── src/
│   │   │   │   ├── main.ts
│   │   │   │   ├── app.module.ts
│   │   │   │   └── config/              # Configuration, env, validation
│   │   │   └── test/                    # Tests e2e globaux
│   │   └── workers/                     # Jobs en arrière-plan (Phase 2+)
│   │       └── src/                     # Rappels, notifications, envois
│   │
│   ├── libs/                            # Bibliothèques partagées (Nx)
│   │   ├── core/                        # Utils, types partagés, exceptions
│   │   ├── database/                    # Configuration TypeORM, migrations
│   │   ├── redis/                       # Client Redis, gestion de cache
│   │   ├── storage/                     # Adapter S3 (R2/MinIO)
│   │   ├── notifications/               # Adapter FCM
│   │   ├── maps/                        # Adapter géocoding OSM
│   │   ├── sms/                         # Adapter SMS/OTP
│   │   └── testing/                     # Helpers de tests (factories, mocks)
│   │
│   └── modules/                         # DOMAINES MÉTIER — 1 dossier = 1 module
│       ├── auth/
│       │   ├── src/
│       │   │   ├── auth.controller.ts       # PRESENTATION
│       │   │   ├── auth.module.ts
│       │   │   ├── dto/                     # DTOs + validations
│       │   │   ├── application/             # APPLICATION (use-cases)
│       │   │   │   ├── register.use-case.ts
│       │   │   │   ├── login.use-case.ts
│       │   │   │   └── otp.use-case.ts
│       │   │   ├── domain/                  # DOMAIN (pur)
│       │   │   │   ├── entities/
│       │   │   │   ├── value-objects/
│       │   │   │   └── ports/               # Interfaces (repositories, adapters)
│       │   │   └── infrastructure/          # INFRASTRUCTURE
│       │   │       ├── repositories/        # Implémentation TypeORM
│       │   │       └── providers/           # JWT, OTP, hash
│       │   └── migrations/                  # Migrations du module
│       ├── users/                        # Même structure
│       ├── professionals/                # Même structure
│       ├── categories/                   # Même structure
│       ├── geolocation/                  # Même structure
│       ├── search/                       # Même structure
│       ├── requests/                     # Même structure
│       ├── messaging/                    # Même structure
│       ├── notifications/                # Même structure
│       ├── reviews/                      # Même structure
│       └── admin/                        # Même structure
│       └── (payments, restaurants, orders, deliveries — Phase 2)
│       └── (ai — Phase 3)
│
├── mobile/                              # Monorepo Flutter
│   ├── packages/
│   │   └── core/                        # Package partagé
│   │       ├── lib/
│   │       │   ├── api/                 # Client HTTP, interceptors, endpoints
│   │       │   ├── models/              # Modèles (parallèles au backend)
│   │       │   ├── providers/           # State management Riverpod
│   │       │   ├── theme/               # Thème, couleurs, styles
│   │       │   ├── widgets/             # Widgets réutilisables
│   │       │   └── utils/               # Formatage, localisation, GPS
│   │       └── test/
│   │
│   ├── apps/
│   │   ├── client/                      # App Client (grand public)
│   │   │   └── lib/
│   │   │       ├── main.dart
│   │   │       ├── app.dart
│   │   │       ├── features/            # 1 dossier par écran/flux
│   │   │       │   ├── auth/
│   │   │       │   ├── home/
│   │   │       │   ├── search/
│   │   │       │   ├── map/
│   │   │       │   ├── categories/
│   │   │       │   ├── professional/    # Fiche pro + portfolio
│   │   │       │   ├── requests/        # Publication de besoin
│   │   │       │   ├── chat/
│   │   │       │   ├── favorites/
│   │   │       │   ├── notifications/
│   │   │       │   └── profile/
│   │   │       └── test/
│   │   │
│   │   ├── professional/                # App Pro (Phase 1, après client)
│   │   │   └── lib/
│   │   │       ├── main.dart
│   │   │       └── features/
│   │   │           ├── dashboard/
│   │   │           ├── calendar/        # Rendez-vous
│   │   │           ├── requests/        # Demandes reçues + réponses
│   │   │           ├── revenue/
│   │   │           ├── stats/
│   │   │           ├── reviews/
│   │   │           ├── profile/         # Vitrine, portfolio, prix
│   │   │           ├── availability/
│   │   │           └── chat/
│   │   │
│   │   └── deliverer/                   # App Livreur (Phase 2)
│   │       └── lib/
│   │           ├── main.dart
│   │           └── features/
│   │               ├── available/       # Courses disponibles
│   │               ├── current/         # Course en cours
│   │               ├── history/
│   │               └── earnings/
│   │
│   └── web/                             # (Phase 3) admin + portail
│       └── admin_dashboard/
│
├── infra/                              # Déploiement (quand le code existe)
│   ├── docker/
│   │   ├── docker-compose.yml          # Dev local (pg, redis, minio)
│   │   └── api.Dockerfile
│   ├── nginx/
│   └── deploy/                         # Scripts + configs production
│
├── .github/
│   └── workflows/                      # CI/CD (lint, tests, build)
│       ├── ci-backend.yml
│       └── ci-mobile.yml
│
└── README.md
```

---

## Structure type d'un module backend (référence)

```
modules/requests/
├── src/
│   ├── requests.controller.ts
│   ├── requests.module.ts
│   ├── dto/
│   │   ├── create-request.dto.ts
│   │   ├── create-quote.dto.ts
│   │   └── select-professional.dto.ts
│   ├── application/
│   │   ├── create-request.use-case.ts
│   │   ├── respond-to-request.use-case.ts
│   │   ├── select-quote.use-case.ts
│   │   └── list-requests.use-case.ts
│   ├── domain/
│   │   ├── entities/
│   │   │   ├── service-request.entity.ts
│   │   │   └── quote.entity.ts
│   │   ├── value-objects/
│   │   │   ├── budget.ts
│   │   │   └── request-status.ts
│   │   └── ports/
│   │       ├── request-repository.interface.ts
│   │       └── notification-port.ts
│   └── infrastructure/
│       ├── repositories/
│       │   └── typeorm-request.repository.ts
│       └── adapters/
│           └── notification.adapter.ts
├── migrations/
│   └── 001-create-requests.ts
└── test/
    ├── unit/
    └── e2e/
```

Règles :
- **Interdiction** d'importer `infrastructure` depuis `domain`.
- Les `application` dépendent des interfaces (`ports`), jamais des implémentations.
- Chaque module possède ses migrations et ses schémas PostgreSQL.
