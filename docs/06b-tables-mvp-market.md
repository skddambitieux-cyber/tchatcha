# Étape 2 — Tables détaillées : Marketplace, Paiements, Avis, Messagerie, Notifications, Admin, Audit

Conventions globales : voir `06-schema-base.md`. Machine à états : `06-schema-base.md` §10.

---

# 1. Schéma `market` — le cœur (exigence §4)

## `market.service_requests`
**Rôle** : publication d'un besoin (Mode B — PRD §12/§13). Agrégat racine du domaine.

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| client_id | uuid NOT NULL FK users.users | |
| category_id | uuid NOT NULL FK pros.categories | catégorie ciblée |
| title | varchar(160) NOT NULL | ex. "Pose de 150 m² de carrelage" |
| description | text NOT NULL | |
| country_code | char(2) NOT NULL FK geo.countries | borné au pays (ADR-009) |
| division_id | uuid NULL FK geo.divisions | quartier/commune |
| location | geography(Point,4326) NULL | adresse du chantier |
| budget_min | numeric(14,2) NULL | |
| budget_max | numeric(14,2) NULL | |
| currency | char(3) NOT NULL | |
| desired_date | timestamptz NULL | date souhaitée (PRD §13) |
| urgency | varchar(24) NOT NULL DEFAULT 'NORMAL' | `LOW`, `NORMAL`, `HIGH`, `EMERGENCY` |
| status | varchar(32) NOT NULL | machine à états §10 |
| expires_at | timestamptz NOT NULL | TTL (job d'expiration) |
| canceled_by | uuid NULL FK users.users | |
| cancel_reason | text NULL | |
| version | int NOT NULL DEFAULT 1 | optimistic lock |
| created_at / updated_at / deleted_at | | |

**Contraintes** : `ck_requests_budget (budget_max IS NULL OR budget_max >= budget_min)` ; `ck_requests_status` (liste des 10 statuts).
**Index** :
- `idx_requests_status_expires(status, expires_at)` — job d'expiration (partiel `WHERE status IN ('OPEN','QUOTED')`)
- `idx_requests_category_created(category_id, created_at desc)` — liste "demandes récentes par métier"
- `idx_requests_client(client_id, created_at desc)` — "mes demandes"
- GiST `idx_requests_location(location)` — "besoins près de moi" (pro)
**Justification** : c'est la brique centrale du Mode B ; les index couvrent les 4 requêtes réelles du produit (expiration, par catégorie, par client, par géo).

## `market.request_attachments` — **SUPPRIMÉ** → remplacé par `media.files`
Les pièces jointes d'un besoin (photos du chantier — PRD §13) sont gérées par `media.files` (owner_type=`REQUEST`, purpose=`ATTACHMENT`) — voir §8 de ce document et `06d-revue-schema.md` §5.

## `market.quotes`
**Rôle** : devis/réponses des pros, y compris contre-offres (négociation).

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| request_id | uuid NOT NULL FK market.service_requests | |
| professional_id | uuid NOT NULL FK pros.profiles | |
| parent_quote_id | uuid NULL FK (self) | chaîne de contre-offres |
| price | numeric(14,2) NOT NULL | |
| currency | char(3) NOT NULL | |
| duration_days | smallint NULL | délai estimé |
| message | text NULL | |
| status | varchar(32) NOT NULL | `PENDING`, `COUNTERED`, `ACCEPTED`, `REJECTED`, `WITHDRAWN` |
| accepted_at | timestamptz NULL | |
| version | int NOT NULL DEFAULT 1 | |
| created_at / updated_at / deleted_at | | |

**Contraintes** : `ck_quotes_price (price > 0)`.
**Index** :
- `idx_quotes_request(request_id, created_at)` — liste des devis d'un besoin
- `idx_quotes_pro(professional_id, created_at desc)` — "mes devis envoyés"
- `uq_quotes_active UNIQUE(request_id, professional_id) WHERE status='PENDING'` (partiel — un pro ne peut avoir qu'un devis en cours par demande)
**Justification** : la négociation (PRD §12) est modélisée par la chaîne `parent_quote_id` + statut `COUNTERED` : chaque contre-offre est un devis fils. Pas de table `negotiations` séparée — le chemin complet est lisible et auditable.

## `market.bookings`
**Rôle** : réservation/rendez-vous après acceptation (PRD §16) — pont vers le paiement et l'avis.

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| request_id | uuid NOT NULL FK market.service_requests | |
| quote_id | uuid NOT NULL FK market.quotes | devis accepté |
| client_id | uuid NOT NULL FK users.users | |
| professional_id | uuid NOT NULL FK pros.profiles | |
| scheduled_start | timestamptz NOT NULL | |
| scheduled_end | timestamptz NULL | |
| status | varchar(32) NOT NULL | `CONFIRMED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, `NO_SHOW`, `DISPUTED`, `REFUNDED` |
| client_confirmed_at | timestamptz NULL | double confirmation (protection) |
| pro_confirmed_at | timestamptz NULL | |
| location | geography(Point,4326) NULL | |
| address_text | text NULL | |
| notes | text NULL | |
| version | int NOT NULL DEFAULT 1 | |
| created_at / updated_at / deleted_at | | |

**Contraintes** : `uq_bookings_quote UNIQUE(quote_id)` (une réservation par devis accepté) ; `ck_bookings_schedule (scheduled_end IS NULL OR scheduled_end > scheduled_start)`.
**Index** :
- `idx_bookings_pro_date(professional_id, scheduled_start)` — **calendrier pro** (PRD §19)
- `idx_bookings_client(client_id, scheduled_start desc)` — "mes rendez-vous"
- `idx_bookings_status_status(status)` — jobs de rappel
**Justification** : la réservation est l'entité qui **verrouille** le créneau pro (les règles de chevauchement vivent dans le use-case, avec `scheduled_start` indexé pour la vérification rapide).

## `market.disputes`
**Rôle** : litiges post-paiement (exigence §4).

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| booking_id | uuid NOT NULL FK market.bookings | |
| opened_by | uuid NOT NULL FK users.users | |
| reason | text NOT NULL | |
| status | varchar(32) NOT NULL | `OPEN`, `UNDER_REVIEW`, `RESOLVED`, `REJECTED` |
| resolution | text NULL | arbitrage admin |
| resolved_by | uuid NULL FK users.users | |
| resolved_at | timestamptz NULL | |
| created_at / updated_at | | |

**Contraintes** : `uq_disputes_booking UNIQUE(booking_id) WHERE status IN ('OPEN','UNDER_REVIEW')` (partiel — un seul litige ouvert par réservation).
**Index** : `idx_disputes_status(status)` (file de modération).
**Justification** : les litiges sont rares mais structurants pour la confiance ; un seul litige ouvert à la fois évite les abus de processus.

---

# 2. Schéma `pay` — indépendant des fournisseurs (exigence §5, ADR-015)

## `pay.transactions`
**Rôle** : transaction unique du produit, **agnostique** du fournisseur.

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid NOT NULL FK users.users | payeur |
| type | varchar(32) NOT NULL | `SERVICE_PAYMENT`, `ORDER_PAYMENT`, `SUBSCRIPTION`, `REFUND`, `PAYOUT`, `WALLET_CREDIT` |
| status | varchar(32) NOT NULL | `PENDING`, `AUTHORIZED`, `SUCCEEDED`, `FAILED`, `REFUNDED`, `REVERSED` |
| amount | numeric(14,2) NOT NULL | |
| fee | numeric(14,2) NOT NULL DEFAULT 0 | frais fournisseur |
| currency | char(3) NOT NULL | |
| booking_id | uuid NULL FK market.bookings | entité liée (polymorphisme explicite ci-dessous) |
| order_id | uuid NULL FK delivery.orders | (P2) |
| subscription_id | uuid NULL FK billing.subscriptions | (P2/3) |
| country_code | char(2) NOT NULL FK geo.countries | |
| version | int NOT NULL DEFAULT 1 | |
| created_at / updated_at | | |

**Index** : `idx_transactions_user(user_id, created_at desc)` ; `idx_transactions_booking(booking_id)` ; `idx_transactions_status(status)` (reconciliation).
**Contraintes** : `ck_transactions_amount (amount > 0)` ; `ck_transactions_entity (exactement UNE référence entité non NULL selon type)`.
**Justification** : une seule table `transactions` = une seule source de vérité comptable ; le fournisseur vit dans `provider_operations`, jamais ici.

## `pay.provider_operations`
**Rôle** : **l'isolateur de fournisseurs** (ADR-015) — chaque tentative d'appel à un provider.

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| transaction_id | uuid NOT NULL FK pay.transactions | |
| provider_code | varchar(32) NOT NULL | `MTN_MOMO`, `MOOV_MONEY`, `CELTIIS_CASH`, `CARD`, `STRIPE`, `PAYPAL` |
| operation_type | varchar(32) NOT NULL | `CHARGE`, `REFUND`, `PAYOUT`, `VERIFY` |
| external_ref | varchar(128) NULL | référence chez le provider |
| status | varchar(32) NOT NULL | `PENDING`, `SUCCEEDED`, `FAILED`, `TIMEOUT` |
| amount | numeric(14,2) NOT NULL | |
| request_payload | jsonb NULL | ce qu'on a envoyé |
| response_payload | jsonb NULL | ce qu'on a reçu |
| initiated_at | timestamptz NOT NULL | |
| completed_at | timestamptz NULL | |

**Contraintes** : `uq_provider_ops UNIQUE(provider_code, external_ref) WHERE external_ref IS NOT NULL` (idempotence).
**Index** : `idx_provider_ops_transaction(transaction_id)` ; `idx_provider_ops_external(provider_code, external_ref)`.
**Justification** : ajouter MTN→Celtiis/Stripe = nouvelle valeur `provider_code` + adapter — **aucune table modifiée** (réponse exacte à l'exigence §5).

## `pay.webhook_events`
**Rôle** : événements webhook entrants, traités de façon idempotente.

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| provider_code | varchar(32) NOT NULL | |
| external_ref | varchar(128) NOT NULL | |
| event_type | varchar(64) NOT NULL | |
| payload | jsonb NOT NULL | brut reçu |
| processed_at | timestamptz NULL | NULL = non traité |
| processing_error | text NULL | |
| created_at | timestamptz NOT NULL | |

**Contraintes** : `uq_webhook_events UNIQUE(provider_code, external_ref, event_type)` — **idempotence webhook** (rejeu sans double débit).
**Justification** : la fiabilité des paiements mobiles exige de tolérer les webhooks dupliqués ; la contrainte unique + `processed_at` garantit l'exactement-une-fois.

## `pay.payouts`
**Rôle** : virements vers les pros (retrait des revenus — PRD §19 Revenus).

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| professional_id | uuid NOT NULL FK pros.profiles | |
| amount | numeric(14,2) NOT NULL | |
| currency | char(3) NOT NULL | |
| status | varchar(32) NOT NULL | `REQUESTED`, `PROCESSING`, `SUCCEEDED`, `FAILED` |
| provider_operation_id | uuid NULL FK pay.provider_operations | |
| requested_at | timestamptz NOT NULL | |
| completed_at | timestamptz NULL | |

**Contraintes** : `ck_payouts_amount (amount > 0)`.
**Index** : `idx_payouts_pro(professional_id, requested_at desc)`.
**Justification** : les pros gagnent leur vie ici ; chaque virement est rattaché à une opération fournisseur traçable.

## `pay.commissions`
**Rôle** : commission plateforme par transaction (exigence §7).

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| transaction_id | uuid NOT NULL FK pay.transactions | |
| rule_code | varchar(64) NOT NULL | identifie la règle appliquée |
| rate | numeric(5,2) NOT NULL | % |
| amount | numeric(14,2) NOT NULL | |
| computed_at | timestamptz NOT NULL | |

**Contraintes** : `uq_commissions_transaction UNIQUE(transaction_id)` ; `ck_commissions_rate (rate BETWEEN 0 AND 100)`.
**Justification** : figer la règle ET le montant au moment du calcul (audit comptable sans surprise lors d'un changement de barème).

## `pay.coupons` / `pay.coupon_redemptions`
**Rôle** : coupons de réduction (exigence §7 — préparé).

**coupons** : `id`, `code` (`uq_coupons_code UNIQUE`), `type` (`PERCENT`/`FIXED`), `value numeric(14,2)`, `max_uses int`, `used_count int`, `valid_from`, `valid_until`, `active`, timestamps.
**coupon_redemptions** : `id`, `coupon_id FK`, `transaction_id FK`, `user_id FK`, `amount_off numeric(14,2)`, `created_at` ; `uq_coupon_redemptions UNIQUE(coupon_id, transaction_id)`.

**Justification** : la structure est triviale (2 tables) et rend les campagnes possibles sans refonte ; pas de surconception.

## `pay.promotions`
**Rôle** : promotions pros (boost de visibilité, remises) — PRD §6 Promotions.

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| professional_id | uuid NULL FK pros.profiles | NULL = plateforme |
| type | varchar(32) NOT NULL | `DISCOUNT`, `BOOST_VISIBILITY`, `FEATURE_HOME` |
| discount_percent | numeric(5,2) NULL | |
| boost_hours | int NULL | |
| starts_at | timestamptz NOT NULL | |
| ends_at | timestamptz NOT NULL | |
| active | boolean NOT NULL DEFAULT true | |
| created_at | timestamptz NOT NULL | |

**Index** : `idx_promotions_active(active, starts_at, ends_at)`.
**Justification** : "professionnels populaires / promotions" de l'accueil (PRD §6) alimentés par cette table.

## `pay.payment_methods`
**Rôle** : moyens de paiement enregistrés (Phase 2, préparé).

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid NOT NULL FK users.users | |
| type | varchar(32) NOT NULL | `MTN_MOMO`, `MOOV_MONEY`, `CARD` |
| phone | varchar(20) NULL | pour mobile money |
| token | text NULL | pour carte |
| is_default | boolean NOT NULL DEFAULT false | |
| status | varchar(32) NOT NULL | `ACTIVE`, `EXPIRED`, `REMOVED` |
| created_at / updated_at | | |

**Index** : `idx_payment_methods_user(user_id)`.
**Justification** : évite de redemander le numéro à chaque paiement ; le token carte ne vit jamais en clair (hash/chiffrement).

---

# 3. Schéma `review` — avis post-prestation (PRD §11)

## `review.reviews`
**Rôle** : avis émis uniquement après prestation complétée — PRD §11.

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| booking_id | uuid NOT NULL FK market.bookings | un avis par prestation |
| request_id | uuid NOT NULL FK market.service_requests | raccourci d'affichage |
| reviewer_id | uuid NOT NULL FK users.users | le client |
| reviewee_id | uuid NOT NULL FK pros.profiles | le pro |
| rating | smallint NOT NULL | note générale 1..5 |
| punctuality | smallint NOT NULL | 1..5 |
| quality | smallint NOT NULL | 1..5 |
| price_ratio | smallint NOT NULL | 1..5 |
| politeness | smallint NOT NULL | 1..5 |
| comment | text NULL | |
| status | varchar(32) NOT NULL | `PENDING`, `APPROVED`, `REJECTED`, `FLAGGED` |
| moderated_by | uuid NULL FK users.users | |
| moderated_at | timestamptz NULL | |
| helpful_count | int NOT NULL DEFAULT 0 | |
| created_at / updated_at / deleted_at | | |

**Contraintes** : `uq_reviews_booking UNIQUE(booking_id)` (un seul avis par prestation) ; `ck_reviews_rating (rating BETWEEN 1 AND 5)` (+ 4 sous-notes).
**Index** :
- `idx_reviews_reviewee(reviewee_id, status, created_at desc)` — liste publique (partiel `WHERE status='APPROVED'` pour la moyenne)
- `idx_reviews_reviewer(reviewer_id, created_at desc)`
- `idx_reviews_status(status)` — file de modération
**Justification** : sous-notes = exigence PRD §11 ; `rating_avg` du pro est mis à jour **en transaction** ici (jamais de `AVG()` au fil de l'eau).

## `review.review_photos` — **SUPPRIMÉ** → remplacé par `media.files`
Les photos d'un avis (PRD §11) sont gérées par `media.files` (owner_type=`REVIEW`, purpose=`REVIEW_PHOTO`) — voir §8 de ce document et `06d-revue-schema.md` §5.

## `review.review_flags`
**Rôle** : signalements d'un avis par les utilisateurs.

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| review_id | uuid NOT NULL FK review.reviews | |
| flagged_by | uuid NOT NULL FK users.users | |
| reason | varchar(64) NOT NULL | `FAKE`, `ABUSE`, `OFF_TOPIC`, `OTHER` |
| comment | text NULL | |
| created_at | timestamptz NOT NULL | |

**Contraintes** : `uq_review_flags UNIQUE(review_id, flagged_by)` (un signalement par personne).
**Justification** : `status='FLAGGED'` déclenche la modération ; l'unicité empêche le spam de signalements.

---

# 4. Schéma `msg` — messagerie (PRD §15)

## `msg.conversations`
**Rôle** : fil de discussion entre 2+ participants.

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| type | varchar(24) NOT NULL | `ONE_TO_ONE`, `GROUP` |
| booking_id | uuid NULL FK market.bookings | contexte métier (devis) |
| last_message_at | timestamptz NULL | tri des listes |
| status | varchar(24) NOT NULL DEFAULT 'OPEN' | `OPEN`, `ARCHIVED` |
| created_at / updated_at | | |

**Index** : `idx_conversations_last(last_message_at desc)` — liste "récentes".
**Justification** : la conversation est liée au contexte (demande) pour que le chat démarre automatiquement à la sélection d'un devis (flux §10).

## `msg.conversation_participants`
**Rôle** : membres + lecture.

| Colonne | Type | Notes |
|---|---|---|
| conversation_id | uuid NOT NULL FK msg.conversations | |
| user_id | uuid NOT NULL FK users.users | |
| last_read_at | timestamptz NULL | |
| joined_at | timestamptz NOT NULL | |

**Contraintes** : `PK (conversation_id, user_id)`.
**Index** : `idx_cp_user(user_id, last_read_at)` — compteur "non lus".
**Justification** : la PK couvre la liste des conversations d'un user ; `last_read_at` alimente les badges.

## `msg.messages`
**Rôle** : messages (texte, image, document, position — PRD §15).

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| conversation_id | uuid NOT NULL FK msg.conversations | |
| sender_id | uuid NOT NULL FK users.users | |
| type | varchar(24) NOT NULL | `TEXT`, `IMAGE`, `DOCUMENT`, `LOCATION`, `AUDIO` |
| content | text NULL | texte ou description |
| media_url | text NULL | S3/CDN |
| s3_key | varchar(512) NULL | |
| location | geography(Point,4326) NULL | type LOCATION |
| reply_to_id | uuid NULL FK (self) | |
| delivered_at | timestamptz NULL | |
| read_at | timestamptz NULL | |
| created_at | timestamptz NOT NULL | |
| deleted_at | timestamptz NULL | |

**Contraintes** : `ck_messages_content (type='TEXT' → content NOT NULL)`.
**Index** : `idx_messages_conv(conversation_id, created_at, id)` — pagination keyset (jamais d'OFFSET) ; `idx_messages_conv_read(conversation_id, read_at)`.
**Justification** : table la plus volumineuse du système → pagination keyset + candidat au partitionnement mensuel (§11.3). Les messages vocaux (PRD §15) = type `AUDIO` + S3, déjà prévu.

---

# 5. Schéma `notif` — notifications (ADR-016)

## `notif.notifications`
**Rôle** : envois planifiés/effectués + boîte de réception in-app.

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid NOT NULL FK users.users | destinataire |
| type | varchar(48) NOT NULL | `NEW_QUOTE`, `NEW_MESSAGE`, `NEW_REVIEW`, `PAYMENT`, `REQUEST_UPDATE`, `PROMOTION` |
| title | varchar(160) NOT NULL | déjà traduit (i18n) |
| body | text NULL | |
| data | jsonb NULL | navigation cible |
| channel | varchar(24) NOT NULL | `PUSH`, `SMS`, `EMAIL`, `WHATSAPP`, `IN_APP` |
| status | varchar(24) NOT NULL | `PENDING`, `SENT`, `DELIVERED`, `FAILED` |
| sent_at | timestamptz NULL | |
| read_at | timestamptz NULL | in-app |
| created_at | timestamptz NOT NULL | |

**Index** : `idx_notifications_user(user_id, read_at)` — boîte + badge ; `idx_notifications_pending(status)` — worker.
**Justification** : le produit métier **n'écrit jamais** dans cette table directement : il émet un événement (Outbox `audit.events`), le module notifications compose les templates i18n et dispatche par canal (ADR-016).

## `notif.notification_preferences`
**Rôle** : préférences canal × type par utilisateur.

| Colonne | Type | Notes |
|---|---|---|
| user_id | uuid NOT NULL FK users.users | |
| event_type | varchar(48) NOT NULL | `NEW_QUOTE`, … |
| channels | jsonb NOT NULL | `{"push":true,"sms":false,"email":true}` |
| updated_at | | |

**Contraintes** : `PK (user_id, event_type)`.
**Justification** : évolutif sans migration (jsonb) ; consulté par le module notifications à chaque événement.

## `notif.notification_templates`
**Rôle** : templates multilingues des messages (ADR-014).

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| code | varchar(64) NOT NULL | `quote.received` |
| channel | varchar(24) NOT NULL | |
| language | varchar(10) NOT NULL | fr/en/… |
| subject | varchar(200) NULL | |
| body | text NOT NULL | avec placeholders `{{client_name}}` |
| active | boolean NOT NULL DEFAULT true | |
| version | int NOT NULL DEFAULT 1 | |
| created_at / updated_at | | |

**Contraintes** : `uq_templates UNIQUE(code, channel, language)`.
**Justification** : ajouter une langue ou changer un libellé = 1 ligne en base, zéro déploiement (répond à l'exigence i18n).

---

# 6. Schéma `admin` — administration

## `admin.validation_tasks`
**Rôle** : file de modération générique (vérifications pro, contenus).

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| entity_type | varchar(32) NOT NULL | `PRO_VERIFICATION`, `REVIEW`, `DISPUTE`, `REPORT` |
| entity_id | uuid NOT NULL | |
| status | varchar(24) NOT NULL | `PENDING`, `APPROVED`, `REJECTED` |
| assignee_id | uuid NULL FK users.users | |
| decided_by | uuid NULL FK users.users | |
| decided_at | timestamptz NULL | |
| note | text NULL | |
| created_at / updated_at | | |

**Index** : `idx_validation_tasks_status(status)` ; `idx_validation_tasks_entity(entity_type, entity_id)`.
**Justification** : une seule file pour tous les flux de validation → dashboard admin unique (PRD §20), extensible sans nouvelle table.

## `admin.reports`
**Rôle** : signalements (pros, contenus) — PRD §20.

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| reporter_id | uuid NOT NULL FK users.users | |
| entity_type | varchar(32) NOT NULL | `PROFESSIONAL`, `REVIEW`, `MESSAGE`, `REQUEST` |
| entity_id | uuid NOT NULL | |
| reason | varchar(64) NOT NULL | `SCAM`, `FAKE`, `SPAM`, `ABUSE`, `OTHER` |
| description | text NULL | |
| status | varchar(24) NOT NULL | `OPEN`, `IN_REVIEW`, `RESOLVED`, `DISMISSED` |
| resolved_by | uuid NULL FK users.users | |
| resolved_at | timestamptz NULL | |
| created_at | timestamptz NOT NULL | |

**Index** : `idx_reports_status(status)` ; `idx_reports_entity(entity_type, entity_id)`.
**Justification** : la confiance marketplace passe par des signalements traités et tracés.

## `admin.bans`
**Rôle** : sanctions (suspensions temporaires ou définitives).

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid NOT NULL FK users.users | |
| reason | text NOT NULL | |
| banned_by | uuid NOT NULL FK users.users | |
| starts_at | timestamptz NOT NULL | |
| ends_at | timestamptz NULL | NULL = définitif |
| created_at | timestamptz NOT NULL | |

**Index** : `idx_bans_user(user_id, ends_at)`.
**Justification** : la suspension n'écrase jamais `users.status` de façon irréversible ; l'historique complet des sanctions est conservé.

## `admin.announcements`
**Rôle** : annonces ciblées (accueil, promotions — PRD §6).

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| title | varchar(160) NOT NULL | |
| body | text NOT NULL | |
| country_code | char(2) NULL FK geo.countries | NULL = tous pays |
| audience | varchar(24) NOT NULL | `ALL`, `CLIENTS`, `PROS` |
| starts_at | timestamptz NOT NULL | |
| ends_at | timestamptz NOT NULL | |
| active | boolean NOT NULL DEFAULT true | |
| created_at | timestamptz NOT NULL | |

**Index** : `idx_announcements_active(active, country_code, starts_at)`.
**Justification** : la bande d'accueil est pilotée par donnée (pas de code).

## `admin.stats_snapshots`
**Rôle** : statistiques précalculées (PRD §20 Statistiques nationales).

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| country_code | char(2) NOT NULL FK geo.countries | |
| metric | varchar(64) NOT NULL | `ACTIVE_PROFESSIONALS`, `REQUESTS`, `TRANSACTIONS_VOLUME` |
| period | varchar(16) NOT NULL | `2026-08-01` |
| value | numeric(20,2) NOT NULL | |
| created_at | timestamptz NOT NULL | |

**Contraintes** : `uq_stats UNIQUE(country_code, metric, period)`.
**Justification** : le dashboard admin affiche des agrégats sans scanner les tables chaudes (jobs de nuit).

---

# 7. Schéma `audit` — historique et traçabilité (exigence §6)

## `audit.logs`
**Rôle** : journal d'audit des actions sensibles (ADR-022).

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| actor_id | uuid NULL FK users.users | NULL = système |
| action | varchar(64) NOT NULL | `PRO_VERIFICATION_APPROVED`, `PAYMENT_REFUNDED`… |
| entity_type | varchar(32) NOT NULL | |
| entity_id | uuid NOT NULL | |
| before | jsonb NULL | état avant |
| after | jsonb NULL | état après |
| ip | inet NULL | |
| user_agent | text NULL | |
| country_code | char(2) NULL FK geo.countries | |
| created_at | timestamptz NOT NULL | |

**Index** : `idx_audit_entity(entity_type, entity_id, created_at)` ; `idx_audit_actor(actor_id, created_at desc)` ; `idx_audit_action(action, created_at)`.
**Justification** : "qui a fait quoi, quand, avec quelles valeurs" sur les actions sensibles uniquement (volume maîtrisé). Partitionnement mensuel futur (§11.3).

## `audit.events` (Outbox)
**Rôle** : file de sortie des événements de domaine (ADR-002, ADR-016) — la colonne vertébrale de la scalabilité.

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| aggregate_type | varchar(64) NOT NULL | `ServiceRequest`, `Quote`… |
| aggregate_id | uuid NOT NULL | |
| event_type | varchar(64) NOT NULL | `request.quoted` |
| payload | jsonb NOT NULL | |
| status | varchar(24) NOT NULL | `PENDING`, `PUBLISHED`, `FAILED` |
| published_at | timestamptz NULL | |
| created_at | timestamptz NOT NULL | |

**Index** : `idx_events_status(status, created_at)` — **transactionnel** avec l'écriture métier (même transaction), lu par les workers (notifications, indexation, paiements).
**Justification** : l'Outbox garantit l'**exactement-une-fois** de la propagation inter-modules ; c'est ce qui permettra l'extraction en microservices (ADR-002) sans réécriture.

## `audit.connections`
**Rôle** : historique complet des connexions (succès + échecs).

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid NULL FK users.users | |
| phone | varchar(20) NULL | si échec avant identification |
| ip | inet NOT NULL | |
| device_id | varchar(64) NULL | |
| user_agent | text NULL | |
| success | boolean NOT NULL | |
| error_code | varchar(32) NULL | |
| created_at | timestamptz NOT NULL | |

**Index** : `idx_connections_user(user_id, created_at desc)` ; `idx_connections_phone(phone, created_at desc)` ; `idx_connections_ip(ip, created_at desc)`.
**Justification** : répond exactement à l'exigence "connexions + tentatives échouées" ; sert aussi la détection de fraude (nouvel appareil/pays).

## `audit.aggregate_events`
**Rôle** : **journal d'événements d'agrégat** (Event Sourcing léger — ajustement 1, `06d-revue-schema.md` §1). Historique permanent et reconstructible de chaque agrégat métier.

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| aggregate_type | varchar(64) NOT NULL | `ServiceRequest`, `Quote`, `Booking`, `Transaction`… |
| aggregate_id | uuid NOT NULL | |
| version | bigint NOT NULL | numéro de version de l'agrégat |
| event_type | varchar(64) NOT NULL | `request.published`, `quote.added`, `request.cancelled`, `request.reopened`, `reputation.recomputed`… |
| payload | jsonb NOT NULL | données de l'événement |
| actor_id | uuid NULL FK users.users | qui a déclenché |
| created_at | timestamptz NOT NULL | |

**Contraintes** : `uq_aggregate_events UNIQUE(aggregate_type, aggregate_id, version)` — append-only, aucun trou de version.
**Index** : `idx_aggregate_events(aggregate_type, aggregate_id, version)` ; `idx_aggregate_events_time(created_at)` (archivage).
**Justification** : écrit en **même transaction** que l'état métier ; rejouer la séquence reconstitue l'état à tout instant (débogage, conformité). Différence avec l'Outbox `audit.events` : celle-ci propage aux autres modules (purgeable) ; `aggregate_events` est l'historique permanent (10 ans, puis archivage S3).

---

# 8. Schéma `media` — fichiers génériques (ajustement 5)

## `media.files`
**Rôle** : UNE table pour tous les médias (portfolio, pièces jointes, photos d'avis, certificats, vérifications, messages, factures, voice notes) — `06d-revue-schema.md` §5.

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| owner_type | varchar(32) NOT NULL | `PROFESSIONAL`, `REQUEST`, `REVIEW`, `CERTIFICATION`, `VERIFICATION`, `MESSAGE`, `INVOICE`, `USER` |
| owner_id | uuid NOT NULL | id de l'entité (pas de FK — polymorphisme volontaire) |
| purpose | varchar(32) NOT NULL | `AVATAR`, `PORTFOLIO`, `BEFORE_AFTER`, `ATTACHMENT`, `REVIEW_PHOTO`, `DOCUMENT`, `INVOICE`, `VOICE_NOTE` |
| media_type | varchar(16) NOT NULL | `IMAGE`, `VIDEO`, `DOCUMENT`, `AUDIO` |
| mime_type | varchar(64) NOT NULL | |
| size_bytes | bigint NOT NULL DEFAULT 0 | |
| width / height | int NULL | images |
| duration_sec | int NULL | vidéos / audio |
| url | text NOT NULL | URL CDN finale |
| s3_key | varchar(512) NOT NULL | clé d'origine (ADR-007) |
| sort_order | int NOT NULL DEFAULT 0 | |
| status | varchar(16) NOT NULL | `PROCESSING`, `READY`, `FAILED` (traitement vignettes) |
| created_at / updated_at / deleted_at | | |

**Index** : `idx_media_owner(owner_type, owner_id, sort_order)` ; `idx_media_s3(s3_key)`.
**Clé S3** : `{country}/{owner_type}/{owner_id}/{uuid}.{ext}`.
**Justification** : remplacer 3+ tables dupliquées par une seule ; ajouter un nouveau type de fichier (facture, voice note) = 1 valeur d'enum, zéro table, zéro migration de structure. Le polymorphisme `owner_type`/`owner_id` (sans FK) est volontaire : l'intégrité est assurée au niveau application + audit.

---

# 9. Schéma `search` — projection de recherche (ajustement 3)

## `search.pro_search_docs`
**Rôle** : **index de recherche dédié**, dénormalisé, alimenté par l'Outbox — répond en millisecondes à "plombier disponible aujourd'hui à moins de 5 km noté > 4,5" sans toucher aux tables métier.

| Colonne | Type | Notes |
|---|---|---|
| professional_id | uuid PK FK pros.profiles | |
| country_code | char(2) NOT NULL | |
| status | varchar(32) NOT NULL | ACTIVE… |
| category_ids | uuid[] NOT NULL | catégories + ancêtres (filtre arborescent) |
| name_search | tsvector NOT NULL | nom + métier + services (GIN) |
| name_trgm | varchar(160) NOT NULL | trigrammes, fautes tolérées (GIN) |
| rating_avg | numeric(2,1) NOT NULL | |
| trust_score | numeric(3,2) NOT NULL | ajustement 2 |
| min_price | numeric(14,2) NULL | |
| location | geography(Point,4326) NOT NULL | GiST |
| division_id | uuid NULL | filtre quartier/commune |
| available_today | boolean NOT NULL DEFAULT false | calculé sur slots + overrides + bookings |
| available_now | boolean NOT NULL DEFAULT false | |
| available_until | timestamptz NULL | prochain créneau |
| updated_at | timestamptz NOT NULL | |
| version | bigint NOT NULL | |

**Index** : GIN `idx_search_name(name_search)` ; GIN `idx_search_trgm(name_trgm)` ; GiST `idx_search_location(location)` ; composite `idx_search_filters(country_code, status, available_today, rating_avg desc)`.
**Justification** : c'est le "search index" prévu par l'ajustement 3 : chaque événement métier (devis, avis, créneau) met à jour la ligne concernée via l'Outbox ; plus tard, le `SearchPort` (ADR-003) bascule vers Elasticsearch/Meilisearch avec **le même document** — aucune refonte du schéma. Les tables métier restent la source de vérité ; cette table est une projection.
