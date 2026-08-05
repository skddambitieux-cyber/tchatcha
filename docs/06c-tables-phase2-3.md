# Étape 2 — Tables détaillées : Phase 2 et 3 (food, delivery, billing)

Niveau de détail : moyen (les tables MVP sont en `06a`/`06b`). Ces tables sont
**prévues au schéma** mais créées avec les migrations de leur phase.

---

# 1. Schéma `food` — Restaurants (Phase 2, PRD §18)

## `food.restaurants`
**Rôle** : fiche restaurant (liée à un profil pro).

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| professional_id | uuid NOT NULL FK pros.profiles | le restaurant EST un pro |
| name | varchar(160) NOT NULL | |
| description | text NULL | |
| cuisine_type | varchar(64) NULL | `local`, `fast_food`, `pâtisserie`… |
| logo_url | text NULL | |
| location | geography(Point,4326) NOT NULL | index GiST |
| division_id | uuid NULL FK geo.divisions | |
| delivery_radius_km | numeric(6,2) NULL | rayon de livraison (cercle) |
| delivery_area_id | uuid NULL FK geo.areas | zone polygonale de livraison (ajustement 7 — `06d` §7) |
| min_order_amount | numeric(14,2) NULL | |
| rating_avg | numeric(2,1) DEFAULT 0 | agrégat maintenu |
| rating_count | int DEFAULT 0 | |
| status | varchar(24) NOT NULL | `DRAFT`, `ACTIVE`, `SUSPENDED` |
| country_code | char(2) NOT NULL FK geo.countries | |
| created_at / updated_at / deleted_at | | |

**Index** : GiST `location` (recherche "restaurants proches" — PRD §6) ; `idx_restaurants_status(country_code, status)`.
**Justification** : le restaurant réutilise l'identité pro (vitrine, avis) ; la géoloc sert le rayon de livraison.

## `food.menus`
**Rôle** : menus d'un restaurant.

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| restaurant_id | uuid NOT NULL FK food.restaurants | ON DELETE CASCADE |
| name | varchar(120) NOT NULL | "Petit-déjeuner", "Plats du jour" |
| description | text NULL | |
| sort_order | int NOT NULL DEFAULT 0 | |
| active | boolean NOT NULL DEFAULT true | |

**Index** : `idx_menus_restaurant(restaurant_id, sort_order)`.

## `food.menu_items`
**Rôle** : plats (P2 — commandes).

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| menu_id | uuid NOT NULL FK food.menus | |
| name | varchar(160) NOT NULL | |
| description | text NULL | |
| price | numeric(14,2) NOT NULL | |
| currency | char(3) NOT NULL | |
| image_url | text NULL | |
| options | jsonb NULL | options/ingrédients `[{"name":"sans piment","extra":0}]` |
| available | boolean NOT NULL DEFAULT true | |
| sort_order | int NOT NULL DEFAULT 0 | |
| created_at / updated_at | | |

**Contraintes** : `ck_menu_items_price (price > 0)`.
**Index** : `idx_menu_items_menu(menu_id, available)`.
**Justification** : `options` en jsonb (flexible, pas de schéma figé d'ingrédients).

## `food.restaurant_hours`
**Rôle** : horaires hebdomadaires (même motif que `pros.business_hours`).

| Colonne | Type | Notes |
|---|---|---|
| restaurant_id | uuid NOT NULL FK food.restaurants | |
| weekday | smallint NOT NULL | 1..7 |
| open_at | time NOT NULL | |
| close_at | time NOT NULL | |
| closed | boolean NOT NULL DEFAULT false | |

**Contraintes** : `PK (restaurant_id, weekday)` ; CHECK horaires.

## `food.restaurant_photos`
**Rôle** : galerie (logo, plats, salle).

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| restaurant_id | uuid NOT NULL FK food.restaurants | |
| type | varchar(24) NOT NULL | `LOGO`, `DISH`, `INTERIOR` |
| media_url | text NOT NULL | |
| sort_order | int NOT NULL DEFAULT 0 | |

---

# 2. Schéma `delivery` — Livraison (Phase 2, PRD §18)

## `delivery.deliverers`
**Rôle** : profils livreurs.

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid NOT NULL FK users.users | |
| status | varchar(24) NOT NULL | `OFFLINE`, `ONLINE`, `BUSY` |
| vehicle_type | varchar(24) NOT NULL | `BICYCLE`, `MOTORCYCLE`, `CAR` |
| current_location | geography(Point,4326) NULL | index GiST |
| rating_avg | numeric(2,1) DEFAULT 0 | |
| rating_count | int DEFAULT 0 | |
| completed_deliveries | int DEFAULT 0 | |
| country_code | char(2) NOT NULL FK geo.countries | |
| created_at / updated_at | | |

**Contraintes** : `uq_deliverers_user UNIQUE(user_id)`.
**Index** : GiST `current_location` + partiel `WHERE status='ONLINE'` — **assignation la plus proche**.

## `delivery.orders`
**Rôle** : commandes (snapshot immuable des articles).

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| client_id | uuid NOT NULL FK users.users | |
| restaurant_id | uuid NOT NULL FK food.restaurants | |
| status | varchar(32) NOT NULL | `PENDING`, `ACCEPTED`, `PREPARING`, `READY_FOR_PICKUP`, `ASSIGNED`, `PICKED_UP`, `IN_TRANSIT`, `DELIVERED`, `CANCELLED` |
| items | jsonb NOT NULL | snapshot `[{name, qty, price, options}]` |
| subtotal | numeric(14,2) NOT NULL | |
| delivery_fee | numeric(14,2) NOT NULL | |
| total | numeric(14,2) NOT NULL | |
| currency | char(3) NOT NULL | |
| source_location | geography(Point,4326) NOT NULL | restaurant |
| destination_location | geography(Point,4326) NOT NULL | client |
| destination_text | text NULL | |
| payment_status | varchar(24) NULL | lié à pay.transactions |
| delivery_option | varchar(24) NOT NULL | `RESTAURANT_STAFF`, `INDEPENDENT` |
| created_at / updated_at | | |

**Contraintes** : `ck_orders_total (total = subtotal + delivery_fee)`.
**Index** : `idx_orders_client(client_id, created_at desc)` ; `idx_orders_restaurant(restaurant_id, created_at desc)` ; GiST `destination_location`.
**Justification** : `items` en snapshot jsonb = prix figés au moment de la commande (historique fiable), pas besoin de tables d'items normalisées.

## `delivery.delivery_runs`
**Rôle** : course d'un livreur pour une commande.

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| order_id | uuid NOT NULL FK delivery.orders | |
| deliverer_id | uuid NOT NULL FK delivery.deliverers | |
| status | varchar(24) NOT NULL | `ASSIGNED`, `PICKED_UP`, `IN_TRANSIT`, `DELIVERED`, `FAILED` |
| distance_km | numeric(6,2) NULL | |
| picked_up_at | timestamptz NULL | |
| delivered_at | timestamptz NULL | |
| created_at | timestamptz NOT NULL | |

**Index** : `idx_runs_order(order_id)` ; `idx_runs_deliverer(deliverer_id, created_at desc)`.
**Justification** : la position temps réel du livreur vit en **Redis** (haute fréquence) ; cette table ne garde que l'historique structurant.

---

# 3. Schéma `billing` — Abonnements, wallet, fidélité (Phase 2/3, exigence §7)

## `billing.subscription_plans`
**Rôle** : plans Premium (PRD Phase 3 — Abonnements).

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| code | varchar(48) NOT NULL | `PRO_BASIC`, `PRO_PREMIUM` |
| name | varchar(120) NOT NULL | |
| price | numeric(14,2) NOT NULL | |
| currency | char(3) NOT NULL | |
| duration_days | int NOT NULL | 30 |
| features | jsonb NOT NULL | `{"boosts":10,"stats":true,"badge":true}` |
| active | boolean NOT NULL DEFAULT true | |
| created_at / updated_at | | |

**Contraintes** : `uq_plans_code UNIQUE(code)`.
**Justification** : la facturation par abonnement réutilise `pay.transactions` (type `SUBSCRIPTION`).

## `billing.subscriptions`
**Rôle** : abonnements actifs des pros.

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| professional_id | uuid NOT NULL FK pros.profiles | |
| plan_id | uuid NOT NULL FK billing.subscription_plans | |
| status | varchar(24) NOT NULL | `TRIAL`, `ACTIVE`, `PAST_DUE`, `CANCELLED`, `EXPIRED` |
| current_period_start | date NOT NULL | |
| current_period_end | date NOT NULL | |
| auto_renew | boolean NOT NULL DEFAULT true | |
| canceled_at | timestamptz NULL | |
| created_at / updated_at | | |

**Index** : `idx_subscriptions_pro(professional_id, status)`.
**Justification** : la valeur `features` du plan conditionne des comportements d'affichage (boost, badge) sans code par plan.

## `billing.wallets`
**Rôle** : portefeuille électronique (exigence §7 — futur).

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid NOT NULL FK users.users | |
| currency | char(3) NOT NULL | |
| balance | numeric(14,2) NOT NULL DEFAULT 0 | |
| version | int NOT NULL DEFAULT 1 | optimistic lock |
| created_at / updated_at | | |

**Contraintes** : `uq_wallets UNIQUE(user_id, currency)` ; `ck_wallets_balance (balance >= 0)`.
**Index** : `idx_wallets_user(user_id)`.
**Justification** : la table existe maintenant, alimentée par `pay.transactions` (type `WALLET_CREDIT`) ; l'ouverture du wallet = activation d'une feature, pas une migration.

## `billing.wallet_ledger`
**Rôle** : mouvements du wallet (immutable).

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| wallet_id | uuid NOT NULL FK billing.wallets | |
| transaction_id | uuid NULL FK pay.transactions | |
| amount | numeric(14,2) NOT NULL | signé (+/-) |
| balance_after | numeric(14,2) NOT NULL | |
| reason | varchar(48) NOT NULL | |
| created_at | timestamptz NOT NULL | |

**Index** : `idx_ledger_wallet(wallet_id, created_at)`.
**Justification** : solde = somme du ledger (auditabilité totale), le `balance` du wallet n'est qu'un cache.

## `billing.loyalty_points` + `billing.loyalty_events`
**Rôle** : programme de fidélité (exigence §7 — futur).

**loyalty_points** : `id`, `user_id` (uq), `balance int`, `updated_at`.
**loyalty_events** : `id`, `user_id`, `points int` (signé), `reason varchar(48)`, `transaction_id nullable FK`, `created_at`.

**Justification** : deux tables légères suffisent ; les points s'accumulent via les transactions validées.

---

# 4. Récapitulatif — nombre de tables par schéma (après ajustements `06d`)

| Schéma | MVP | P2/P3 | Total |
|---|---|---|---|
| auth | 3 | – | 3 |
| users | 7 | – | 7 |
| geo | 3 | – | 3 |
| pros | 10 | – | 10 |
| market | 3 | – | 3 |
| pay | 8 | – | 8 |
| review | 2 | – | 2 |
| msg | 3 | – | 3 |
| notif | 3 | – | 3 |
| admin | 5 | – | 5 |
| audit | 4 | – | 4 |
| ai | 5 | – | 5 |
| media | 1 | – | 1 |
| search | 1 | – | 1 |
| food | – | 4 | 4 |
| delivery | – | 3 | 3 |
| billing | – | 4 | 4 |
| **Total** | **58** | **11** | **69** |

58 tables MVP + 11 tables Phase 2/3 = 69 tables, toutes justifiées métier, réparties en 17 schémas indépendants.

Évolutions par rapport à la v1.0 (documentées dans `06d-revue-schema.md`) :
+ `audit.aggregate_events`, `pros.reputation`, `search.pro_search_docs`, `media.files`, `users.consents`, `pros.coverage_areas` ;
– `pros.portfolio_items`, `market.request_attachments`, `review.review_photos`, `pros.intervention_zones` ;
✏️ `geo.zones` → `geo.areas`, état `REOPENED`, `trust_score`, `anonymized_at`, `media_id`.

---

# 5. Points de revue à valider (en plus de `06-schema-base.md` §14)

- [ ] Modèle `quotes` (chaîne de contre-offres `parent_quote_id`) : la négociation sans table séparée te convient-elle ?
- [ ] `users.users` : unicité téléphone **par pays** (un même numéro peut exister dans 2 pays) — OK ?
- [ ] Snapshot jsonb des articles de commande (`delivery.orders.items`) vs tables normalisées — choix documenté.
- [ ] L'Outbox `audit.events` comme colonne vertébrale inter-modules — OK ?
- [ ] Index partiels pour soft delete (recréation d'un téléphone après suppression) — OK ?
