# Architecture Decision Records (ADR)

Chaque décision structurante est enregistrée avec son contexte, le choix retenu
et ses conséquences. Un ADR ne se modifie pas : on en crée un nouveau si la
décision évolue.

Format : `ADR-XXX - Titre`

---

## ADR-001 — Monolithe modulaire (Modular Monolith) pour le MVP

- **Statut** : Accepté
- **Date** : 2026

### Contexte
Le projet doit sortir un MVP vite, tout en restant capable de devenir une
plateforme multi-modules, multi-apps et multi-pays. Une architecture en
microservices dès le départ est lourde (déploiement, complexité, coûts) pour
une équipe au démarrage.

### Décision
Construire un **monolithe modulaire** NestJS dans un monorepo Nx :
- un seul processus, une seule base PostgreSQL ;
- chaque domaine métier est un module strictement délimité (schéma de base dédié) ;
- interdiction pour un module d'importer directement l'implémentation d'un autre module (passage par interfaces/contrats).

### Conséquences
- Simplicité de déploiement (1 conteneur) et de débogage pour le MVP.
- Migration vers microservices possible module par module (voir ADR-002).
- Disciplines requises : les frontières de modules doivent être respectées dans les revues de code.

---

## ADR-002 — Extraction vers microservices par événements (futur)

- **Statut** : Proposé (non activé)

### Contexte
Quand la plateforme grossira (plusieurs millions d'utilisateurs, équipes multiples),
le monolithe modulaire devra être fractionné.

### Décision
Extraire les modules **un par un**, dans l'ordre des contraintes (paiements,
notifications, recherche), en utilisant :
- des événements de domaine (Redis Streams ou RabbitMQ) pour la propagation ;
- une base par service (Data ownership).

### Conséquences
- Nécessite dès aujourd'hui : interfaces propres, agrégats définis, événements de domaine modélisés (à poser à l'Étape 2 avec le schéma).

---

## ADR-003 — PostgreSQL + PostGIS comme moteur de recherche initial

- **Statut** : Accepté

### Contexte
La recherche (mot-clé, catégorie, distance, note, tarif, disponibilité) est la
fonctionnalité reine. Le PRD interdit les coûts inutiles.

### Décision
- PostgreSQL 16 + **PostGIS** pour la géolocalisation et les recherches à distance (`ST_DWithin`, `ST_DistanceSphere`).
- Index `GIN` (full-text) et `GiST` (géométrie).
- L'interface `search` du domaine cache le moteur : bascule vers Elasticsearch possible sans impact métier.

### Conséquences
- Pas de service supplémentaire à opérer au MVP.
- Doit être validé par les benchmarks de la Phase 1 (volume Bénin : très largement suffisant).

---

## ADR-004 — JWT avec refresh token rotatif + OTP SMS

- **Statut** : Accepté

### Contexte
Authentification mobile en zone à faible connectivité, lutte contre les faux
comptes, sécurité des paiements à venir.

### Décision
- Access token JWT court (15 min) + refresh token longue durée (30 j) stocké côté client, rotation à chaque usage.
- OTP SMS obligatoire à l'inscription (un numéro = un compte) et optionnel pour les actions sensibles.
- OAuth Google/Apple : reporté (phase ultérieure), l'interface `auth` le permettra.

### Conséquences
- Nécessite Redis pour tracker les refresh tokens utilisés (détection de vol) et les OTP.

---

## ADR-005 — Flutter avec package core partagé (monorepo)

- **Statut** : Accepté

### Contexte
4 apps (client, pro, livreur, admin web possible) sur les mêmes modèles et thèmes.

### Décision
- Monorepo Flutter : package `core` (thème, widgets, API client, modèles, Riverpod) + une app par rôle.
- Riverpod comme state management.

### Conséquences
- Une modification de design se propage aux 4 apps.
- Test widgets centralisés dans `core`.

---

## ADR-006 — Cartographie OpenStreetMap + MapLibre

- **Statut** : Accepté

### Contexte
Le PRD impose OSM pour limiter les coûts, Google Maps en option future.

### Décision
- MapLibre GL (tuiles OSM gratuites ou auto-hébergées) côté mobile et web.
- Reverse geocoding : Nominatim (avec cache Redis + respect du quota) ou auto-hébergé.

### Conséquences
- Coût quasi nul ; nécessite des tuiles performantes au niveau national (à anticiper avant la Phase 2).

---

## ADR-007 — Médias sur S3 compatible (Cloudflare R2)

- **Statut** : Accepté

### Contexte
Photos de profils, portfolios, documents, échanges de chat, avant/après.

### Décision
- Stockage objet S3-compatible (Cloudflare R2 pour la gratuité d'égress, MinIO en local/dev).
- Upload signé (pre-signed URLs) pour ne pas faire transiter les gros fichiers par le backend.
- CDN Cloudflare devant.

### Conséquences
- Aucun vendor lock-in : le code parle le protocole S3 (interface `storage` du domaine).

---

## ADR-008 — Rôles et permissions dès le MVP

- **Statut** : Accepté

### Contexte
4 rôles (client, professional, deliverer, admin) avec des droits distincts sur
les mêmes ressources (fiches, demandes, commandes).

### Décision
- Table `roles` + `permissions`, enum simple au MVP, gardes NestJS par permission.
- Pas de hiérarchie complexe de groupes au MVP (réévaluation en Phase 2 si besoin).

### Conséquences
- La sécurité des endpoints est vérifiable unitairement (tests de guards).

---

## ADR-009 — Multi-pays dès la conception

- **Statut** : Accepté

### Contexte
Vision : Bénin d'abord, Afrique de l'Ouest ensuite (Togo, Burkina, Niger…).

### Décision
- Clé `country` (code ISO 3166-1 alpha-2) dans les tables structurantes : utilisateurs, pros, catégories, demandes, devises.
- Devise configurable par pays (XOF par défaut).
- Toute requête de recherche est bornée au pays de l'utilisateur.

### Conséquences
- Le déploiement d'un nouveau pays = configuration + données de localisation, sans refonte.

---

## ADR-010 — API REST + Swagger, GraphQL seulement si besoin

- **Statut** : Accepté

### Contexte
Le PRD impose REST (GraphQL en option).

### Décision
- API REST versionnée (`/api/v1/...`) documentée par Swagger/OpenAPI auto-généré.
- Versioning par en-tête `Accept` si rupture de contrat.

### Conséquences
- Les clients mobiles (Flutter) consomment un contrat stable ; la doc sert de source de vérité entre front et back (voir Étape 4).

---

## ADR-011 — TypeORM avec migrations versionnées

- **Statut** : Accepté (à revalider lors du choix ORM définitif)

### Contexte
Base évolutive, plusieurs modules, déploiement multi-environnements.

### Décision
- TypeORM avec migrations SQL versionnées (une migration par module, numérotée).
- Schémas PostgreSQL distincts par module (`users`, `requests`, ...).

### Conséquences
- Chaque module évolue sans conflit avec les autres ; rollback possible.

---

## ADR-012 — Tests systématiques

- **Statut** : Accepté

### Contexte
Exigence de code professionnel, testable, évolutif.

### Décision
- Jest pour les tests unitaires (domaine et application).
- Supertest pour les tests e2e (API complète sur base de test).
- Coverage cible : 80 % du domaine, 70 % global.

### Conséquences
- La régression est maîtrisée malgré l'ajout continu de modules.

---

## ADR-013 — Modèle géographique hiérarchique universel (multi-pays)

- **Statut** : Accepté

### Contexte
Déploiement Bénin → Togo, Burkina, Niger, Côte d'Ivoire, Sénégal… avec des découpages administratifs différents. Aucune modification de code souhaitée lors d'un nouveau pays.

### Décision
- Module `geography` unique avec arborescence récursive : `Country → Region → Department → Commune → Arrondissement → Quartier` (table `geo_divisions` avec `parent_id`).
- Tout enregistrement structurant porte `country_code` (ISO 3166-1 alpha-2) ; recherche toujours bornée au pays.
- Devise configurable par pays ; traduction des noms via le modèle i18n (ADR-014).
- Aucune constante de localisation dans le code métier.

### Conséquences
- Ajouter un pays = charger ses données géographiques et sa configuration, rien d'autre.

---

## ADR-014 — Internationalisation dès le premier jour

- **Statut** : Accepté

### Contexte
Français, anglais, langues locales (futur). Toutes les chaînes doivent être externalisées.

### Décision
- Frontend : fichiers `.arb` (français, anglais, + langues locales).
- Backend : templates de notifications/messages traduits (module i18n).
- Contenu métier (catégories, géographie) : libellés multilingues dans la base.
- API : en-tête `Accept-Language`.

### Conséquences
- Aucune chaîne utilisateur visible en dur dans le code ; ajout d'une langue = nouveaux fichiers de traduction.

---

## ADR-015 — Architecture Payment Provider (aucun vendor lock-in)

- **Statut** : Accepté

### Contexte
MTN MoMo, Moov Money, Celtiis Cash, cartes, Stripe, PayPal… sans dépendre d'un seul fournisseur.

### Décision
- Port `PaymentGatewayPort` (`initiate / verify / refund / handleWebhook`) dans le domaine.
- Un adapter par fournisseur (sandbox + production), activé par configuration.
- Table `transactions` unique ; webhooks normalisés en événements métier via Outbox.
- Le cœur de l'application ne connaît jamais un SDK de paiement.

### Conséquences
- Ajouter un fournisseur = ajouter un adapter + config + tests de contrat. Zéro impact métier.

---

## ADR-016 — Architecture Notification Provider multi-canaux

- **Statut** : Accepté

### Contexte
Push Firebase aujourd'hui ; SMS, WhatsApp, email demain, sans réécriture.

### Décision
- Les modules métier émettent des événements de domaine (`request.new_quote`, …).
- Le module `notifications` les transforme via templates i18n et préférences utilisateur (canaux + langue).
- Port `NotificationProviderPort` (`send`) ; un adapter par canal (FCM, SMS, WhatsApp, email).
- Canal en échec → file de secours (Redis) + bascule sur canal de repli.

### Conséquences
- Ajouter un canal = un adapter + configuration ; le métier ne change jamais.

---

## ADR-017 — Ports transversaux socle (storage, map, search, sms, logging)

- **Statut** : Accepté

### Contexte
Interchangeabilité totale des services externes : stockage, cartographie, recherche, SMS, journalisation.

### Décision
Ports définis dès le MVP, avec adapter de référence :
- `StoragePort` → protocole S3 (R2/MinIO/AWS/GCS)
- `MapPort` → OSM aujourd'hui, Google/Mapbox demain
- `SearchPort` → PostgreSQL aujourd'hui, Elasticsearch/Meilisearch/OpenSearch demain (+ synchronisation par événements, pattern Outbox)
- `SmsPort` → fournisseur SMS interchangeable
- `LoggingPort` → journalisation structurée JSON + correlation-id (base du monitoring)

### Conséquences
- Toute dépendance externe passe par un port (règle de revue de code) ; les remplacements sont des adaptations locales testées par contrats.

---

## ADR-018 — Cache multi-niveaux

- **Statut** : Accepté

### Contexte
Volumes croissants, latence mobile, coûts à maîtriser.

### Décision
- 4 niveaux : CDN (statiques/médias) → cache local in-process (hot data) → Redis (cache-aside, sessions, OTP, files) → PostgreSQL.
- Invalidation par événements métier (jamais de TTL aveugle sur données critiques).
- L'interface de cache est derrière un port du socle.

### Conséquences
- Politique de cache modifiable par configuration sans toucher au métier.

---

## ADR-019 — Observabilité préparée (OpenTelemetry)

- **Statut** : Accepté

### Contexte
Logs centralisés, métriques, traces, alertes, tableaux de bord nécessaires à la Phase 1/2.

### Décision
- Logs structurés JSON + `correlation-id` sur chaque requête (via `LoggingPort`).
- Interfaces OpenTelemetry (traces, métriques) branchées dans les adapters.
- Outils cibles : Prometheus + Grafana, Loki, Sentry ; alertes par seuils.
- Health checks sur chaque module dès le MVP.

### Conséquences
- Le câblage réel se fait en Phase 1 sans toucher au code métier (adapters uniquement).

---

## ADR-020 — Marketplace : cycle de vie complet avec statuts explicites

- **Statut** : Accepté

### Contexte
Le produit est une marketplace de services : besoin → devis → négociation → réservation → paiement → avis.

### Décision
- Statuts explicites et transitions validées par le domaine :
  `OPEN → QUOTED → NEGOTIATING → SELECTED → PAID → COMPLETED → REVIEWED | CANCELLED`
- Entités : `requests`, `quotes` (avec contre-offres), `negotiations`, `bookings`, `transactions` (commission plateforme).
- Mode A (recherche directe) = raccourci vers la même réservation.

### Conséquences
- Le cycle est testable unitairement ; chaque nouveau flux (commande restaurant, abonnement) réutilise le même squelette.

---

## ADR-021 — Module IA créé vide avec ports stables

- **Statut** : Accepté

### Contexte
IA en Phase 3 (recommandations, prix, analyse d'avis, matching, anti-fraude, assistant), sans refonte des autres modules.

### Décision
- Module `ai` présent dès le MVP avec ses ports définis (`RecommendationPort`, `PricingPort`, `ReviewsAnalysisPort`, `MatchingPort`, `FraudDetectionPort`, `AssistantPort`).
- Implémentations de repli heuristiques au MVP ; les modèles IA se branchent derrière les ports en Phase 3.

### Conséquences
- Les consommateurs (recherche, paiements, admin) sont écrits contre les ports dès le départ.

---

## ADR-022 — Audit, anti-bot et anti-fraude

- **Statut** : Accepté

### Contexte
Plateforme ouverte : faux comptes, spam, abus, fraude paiements.

### Décision
- Table `audit_logs` : actions sensibles uniquement (qui, quoi, quand, IP, avant/après).
- Rate limiting adaptatif (IP + compte + endpoint) sur Redis.
- Heuristiques anti-bot au MVP (fréquence, empreinte appareil, CAPTCHA si suspicion) ; événements de risque émis vers `FraudDetectionPort` (P3).
- Verrouillage de compte après échecs répétés ; notification des nouvelles connexions.

### Conséquences
- Sécurité testable par endpoint ; l'IA anti-fraude se branche sans réécriture.
