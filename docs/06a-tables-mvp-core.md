# Étape 2 — Tables détaillées : Domaines Cœur (auth, users, geo, pros, ai)

Conventions globales : voir `06-schema-base.md`. Chaque fiche : rôle → colonnes clés →
contraintes → index → justification. Types : UUID = `uuid default gen_random_uuid()`,
dates = `timestamptz`, montants = `numeric(14,2)`, statuts = `varchar(32)` + CHECK.

---

# 1. Schéma `auth` — identité et sécurité

## `auth.otp_codes`
**Rôle** : codes à usage unique (inscription, connexion, reset, action sensible).

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| phone | varchar(20) NOT NULL | |
| country_code | char(2) NOT NULL FK geo.countries | |
| purpose | varchar(32) NOT NULL | `REGISTER`, `LOGIN`, `RESET_PASSWORD`, `PAYMENT` |
| code_hash | varchar(64) NOT NULL | hash SHA-256 (jamais le code en clair) |
| expires_at | timestamptz NOT NULL | TTL 5 min |
| attempts | int NOT NULL DEFAULT 0 | max 3 (CK) |
| used_at | timestamptz NULL | |
| created_at | timestamptz NOT NULL | |

**Index** : `idx_otp_phone_purpose_created(phone, purpose, created_at desc)` (lecture du dernier OTP).
**Contraintes** : `ck_otp_attempts (attempts BETWEEN 0 AND 3)`.
**Justification** : l'OTP vit 5 min en Redis pour la vérification chaude (ADR-004) ; cette table est la **trace d'audit** de chaque émission (statistiques anti-fraude, débogage).

## `auth.refresh_tokens`
**Rôle** : sessions longues (refresh rotatif, détection de vol — ADR-004).

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid NOT NULL FK users.users | |
| token_hash | varchar(64) NOT NULL | jamais de token en clair |
| device_id | varchar(64) NOT NULL | empreinte appareil |
| ip | inet NOT NULL | |
| user_agent | text NULL | |
| expires_at | timestamptz NOT NULL | 30 jours |
| revoked_at | timestamptz NULL | rotation : l'ancien est révoqué |
| replaced_by | uuid NULL FK (self) | chaîne de rotation |
| created_at | timestamptz NOT NULL | |

**Index** : `uq_refresh_tokens_token_hash UNIQUE` ; `idx_refresh_tokens_user(user_id, revoked_at)`.
**Contraintes** : `ck_refresh_tokens_dates (expires_at > created_at)`.
**Justification** : la rotation (`replaced_by`) permet de détecter le **rejeu d'un token révoqué** = vol de session.

## `auth.login_attempts`
**Rôle** : historique des connexions, y compris les échecs (exigence §6).

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| phone | varchar(20) NULL | |
| user_id | uuid NULL FK users.users | |
| ip | inet NOT NULL | |
| device_id | varchar(64) NULL | |
| success | boolean NOT NULL | |
| error_code | varchar(32) NULL | `BAD_OTP`, `ACCOUNT_LOCKED`… |
| created_at | timestamptz NOT NULL | |

**Index** : `idx_login_attempts_phone_created(phone, created_at desc)` ; `idx_login_attempts_ip(ip, created_at desc)` (anti-bot).
**Justification** : données d'anti-fraude (verrouillage, règle de rate limiting), complétées par Redis pour les compteurs en temps réel (ADR-022).

---

# 2. Schéma `users` — profils et préférences

## `users.users`
**Rôle** : compte racine de toute personne (client, pro, livreur, admin).

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| country_code | char(2) NOT NULL FK geo.countries | pays du compte |
| phone | varchar(20) NOT NULL | |
| email | varchar(255) NULL | `lower(email)` |
| password_hash | varchar(255) NOT NULL | bcrypt coût 12 |
| full_name | varchar(120) NOT NULL | |
| avatar_url | text NULL | S3 |
| locale | varchar(10) NOT NULL DEFAULT 'fr' | i18n (ADR-014) |
| status | varchar(32) NOT NULL | `PENDING_OTP`, `ACTIVE`, `SUSPENDED`, `BANNED` |
| otp_verified_at | timestamptz NULL | |
| last_login_at | timestamptz NULL | |
| flags | jsonb NOT NULL DEFAULT '{}' | signalements cumulés, empreintes |
| anonymized_at | timestamptz NULL | RGPD : date d'anonymisation (voir `06d` §6) |
| version | int NOT NULL DEFAULT 1 | optimistic lock |
| created_at / updated_at / deleted_at | | standard |

**Contraintes** : `uq_users_phone UNIQUE(phone, country_code) WHERE deleted_at IS NULL` (partiel — un téléphone est unique **par pays**).
**Index** : `uq_users_email WHERE email IS NOT NULL AND deleted_at IS NULL` ; `idx_users_status(country_code, status)`.
**Justification** : compte unique = identité ; le statut permet le gel/ban sans suppression (soft delete pour le droit à l'oubli). `anonymized_at` : à la demande de suppression RGPD, les champs personnels (phone/email/nom) sont pseudonymisés, les identifiants conservés pour l'audit et les obligations comptables.

## `users.user_roles`
**Rôle** : multi-rôles — un utilisateur peut être client ET pro ET livreur (PRD).

| Colonne | Type | Notes |
|---|---|---|
| user_id | uuid NOT NULL FK users.users | |
| role | varchar(32) NOT NULL | `CLIENT`, `PROFESSIONAL`, `DELIVERER`, `ADMIN` |
| granted_at | timestamptz NOT NULL | |

**Contraintes** : `PK (user_id, role)` ; **Pas de colonnes standard** (table de liaison pure).
**Justification** : le PRD décrit des apps séparées, mais un restaurateur est aussi client ; le RBAC (ADR-008) en découle sans table `roles` complexe (ajout des permissions plus tard si besoin).

## `users.identities`
**Rôle** : identités externes (OAuth Google/Apple — phase ultérieure, ADR-004).

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid NOT NULL FK users.users | |
| provider | varchar(32) NOT NULL | `GOOGLE`, `APPLE` |
| provider_user_id | varchar(128) NOT NULL | |
| created_at | timestamptz NOT NULL | |

**Contraintes** : `uq_identities_provider UNIQUE(provider, provider_user_id)`.
**Justification** : préparation d'OAuth sans toucher `users` plus tard.

## `users.devices`
**Rôle** : appareils connectés + tokens FCM (push).

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid NOT NULL FK users.users | |
| device_id | varchar(64) NOT NULL | ID du device Flutter |
| platform | varchar(16) NOT NULL | `android`, `ios` |
| fcm_token | varchar(255) NULL | mis à jour à chaque connexion |
| last_seen_at | timestamptz NULL | |
| created_at | timestamptz NOT NULL | |

**Contraintes** : `uq_devices_device UNIQUE(user_id, device_id)`.
**Index** : `idx_devices_fcm(fcm_token)` (envoi push).
**Justification** : la messagerie multi-appareils exige un token par device ; `last_seen_at` sert aux notifications intelligentes.

## `users.addresses`
**Rôle** : adresses enregistrées (livraison, besoin, RDV).

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid NOT NULL FK users.users | |
| country_code | char(2) NOT NULL FK geo.countries | |
| division_id | uuid NULL FK geo.divisions | quartier/commune rattaché |
| label | varchar(64) NOT NULL | ex. "Maison", "Bureau" |
| address_line | text NULL | description libre |
| location | geography(Point,4326) NULL | GPS |
| is_default | boolean NOT NULL DEFAULT false | |
| created_at / updated_at | | |

**Index** : `idx_addresses_user(user_id)`.
**Justification** : éviter de redemander le GPS à chaque besoin ; base de la livraison P2.

## `users.favorites`
**Rôle** : favoris client → professionnels.

| Colonne | Type | Notes |
|---|---|---|
| user_id | uuid NOT NULL FK users.users | |
| professional_id | uuid NOT NULL FK pros.profiles | |
| created_at | timestamptz NOT NULL | |

**Contraintes** : `PK (user_id, professional_id)`.
**Justification** : table de liaison pure, requête par user indexée par la PK.

## `users.user_settings`
**Rôle** : préférences (langue, notifications par canal — ADR-016).

| Colonne | Type | Notes |
|---|---|---|
| user_id | uuid PK FK users.users | |
| language | varchar(10) NOT NULL DEFAULT 'fr' | |
| notif_channels | jsonb NOT NULL DEFAULT '{"push":true,"sms":false,"email":true,"whatsapp":false}' | |
| quiet_hours | jsonb NULL | ex. `{"start":"22:00","end":"07:00"}` |
| updated_at | | |

**Justification** : jsonb volontaire (matrice canal × type évolutive sans migration).

## `users.consents`
**Rôle** : consentements RGPD/loi locale (ajustement 6 — `06d-revue-schema.md`).

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid NOT NULL FK users.users | |
| type | varchar(32) NOT NULL | `TOS`, `PRIVACY`, `MARKETING`, `LOCATION`, `DATA_PROCESSING` |
| version | varchar(16) NOT NULL | version du document consentie |
| granted | boolean NOT NULL | |
| granted_at | timestamptz NULL | |
| revoked_at | timestamptz NULL | |
| created_at | timestamptz NOT NULL | |

**Contraintes** : `uq_consents UNIQUE(user_id, type)`.
**Justification** : aucun usage (notification marketing, géolocalisation) sans consentement `granted` valide ; les révocations sont conservées (historique des versions, auditable).

---

# 3. Schéma `geo` — géographie multi-pays (ADR-013)

## `geo.countries`
**Rôle** : pays supportés (Bénin, Togo, Burkina, Niger…).

| Colonne | Type | Notes |
|---|---|---|
| code | char(2) PK | ISO 3166-1 alpha-2 |
| name | varchar(80) NOT NULL | |
| name_translations | jsonb NOT NULL DEFAULT '{}' | i18n |
| currency | char(3) NOT NULL | XOF… |
| phone_code | varchar(8) NOT NULL | +229… |
| locale_default | varchar(10) NOT NULL | fr |
| active | boolean NOT NULL DEFAULT true | |
| created_at | timestamptz NOT NULL | |

**Justification** : ouvrir un pays = une ligne + données géo. Aucun code à changer (ADR-013).

## `geo.divisions`
**Rôle** : arborescence administrative universelle (région → département → commune → arrondissement → quartier).

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| country_code | char(2) NOT NULL FK geo.countries | |
| parent_id | uuid NULL FK (self) | NULL = niveau racine (région/département) |
| type | varchar(24) NOT NULL | `REGION`, `DEPARTMENT`, `COMMUNE`, `ARRONDISSEMENT`, `QUARTER` |
| name | varchar(120) NOT NULL | |
| name_translations | jsonb NOT NULL DEFAULT '{}' | |
| depth | int NOT NULL | 0..4 (dérivable, mais utile en index) |
| path | ltree NULL | chemin matérialisé (`BJ.OUEME.COTONOU`) |
| centroid | geography(Point,4326) NULL | point représentatif |
| boundary | geometry(MultiPolygon,4326) NULL | périmètre (rendu carte) |
| active | boolean NOT NULL DEFAULT true | |
| created_at | timestamptz NOT NULL | |

**Contraintes** : `ck_divisions_type (type IN (...))` ; `ck_divisions_depth (depth BETWEEN 0 AND 4)`.
**Index** : `idx_divisions_parent(parent_id)` ; `idx_divisions_path` (GiST ltree) ; `idx_divisions_country(country_code, type)`.
**Justification** : le découpage varie par pays (Bénin : départements→communes→arrondissements→quartiers ; Togo : régions→préfectures) — le modèle récursif + `type` + `depth` absorbe **toute** hiérarchie sans refonte.

## `geo.areas`
**Rôle** : zones de couverture nommées — cercles, polygones ou périmètre d'une division (ajustement 7 — `06d-revue-schema.md`). Ex. "J'interviens dans toute la commune d'Abomey-Calavi".

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| country_code | char(2) NOT NULL FK geo.countries | |
| name | varchar(120) NOT NULL | "Abomey-Calavi", "Zone aéroport" |
| division_id | uuid NULL FK geo.divisions | lié à une commune/quartier si pertinent |
| shape_type | varchar(16) NOT NULL | `CIRCLE`, `POLYGON`, `DIVISION` |
| center | geography(Point,4326) NULL | si CIRCLE |
| radius_m | numeric(10,2) NULL | si CIRCLE |
| polygon | geography(MultiPolygon,4326) NULL | si POLYGON (ou bordure de la division) |
| active | boolean NOT NULL DEFAULT true | |
| created_at | timestamptz NOT NULL | |

**Contraintes** : `ck_areas_shape` (CIRCLE → `center` ET `radius_m` NOT NULL ; POLYGON → `polygon` NOT NULL ; DIVISION → `division_id` NOT NULL).
**Index** : GiST `idx_areas_polygon(polygon)` ; GiST `idx_areas_center(center)` — requêtes `ST_Contains`/`ST_Intersects`.
**Justification** : un pro (ou un restaurant en P2) peut décrire sa couverture par **rayon, polygone ou commune entière** sans code : `geo.areas` unifie les trois formes (ajustement 7).

---

# 4. Schéma `pros` — professionnels (PRD §9, §10, §21)

## `pros.categories`
**Rôle** : arborescence des catégories (Restauration, Artisans, Automobile…) — PRD §4.

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| parent_id | uuid NULL FK (self) | NULL = catégorie racine |
| country_code | char(2) NOT NULL FK geo.countries | |
| name | varchar(120) NOT NULL | |
| slug | varchar(140) NOT NULL | URL friendly |
| icon_url | text NULL | |
| sort_order | int NOT NULL DEFAULT 0 | |
| translations | jsonb NOT NULL DEFAULT '{}' | i18n (ADR-014) |
| active | boolean NOT NULL DEFAULT true | |
| created_at / updated_at / deleted_at | | |

**Contraintes** : `uq_categories_slug UNIQUE(country_code, slug) WHERE deleted_at IS NULL`.
**Index** : `idx_categories_parent(parent_id)`.
**Justification** : la liste du PRD (maçons, carreleurs, DJ…) est une **donnée**, pas du code : on peut ajouter une sous-catégorie sans déployer (Open/Closed).

## `pros.profiles`
**Rôle** : fiche professionnelle (vitrine) — PRD §9.

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid NOT NULL FK users.users | 1 pro = 1 user |
| business_name | varchar(120) NULL | nom d'entreprise/enseigne |
| headline | varchar(160) NULL | ex. "Carreleur 15 ans d'expérience" |
| description | text NULL | présentation |
| experience_years | smallint NULL | |
| employees_count | smallint NULL | |
| status | varchar(32) NOT NULL | `DRAFT`, `PENDING_VERIFICATION`, `ACTIVE`, `SUSPENDED` |
| verified | boolean NOT NULL DEFAULT false | badge (ADR-008) |
| verified_at | timestamptz NULL | |
| rating_avg | numeric(2,1) NOT NULL DEFAULT 0 | maintenu par transaction |
| rating_count | int NOT NULL DEFAULT 0 | |
| trust_score | numeric(3,2) NOT NULL DEFAULT 0 | **dénormalisé** depuis `pros.reputation` (ajustement 2) |
| completed_jobs | int NOT NULL DEFAULT 0 | |
| response_time_min | int NULL | moyenne |
| min_price | numeric(14,2) NULL | prix indicatif |
| currency | char(3) NOT NULL | |
| website | varchar(255) NULL | |
| social_links | jsonb NULL | WhatsApp, Facebook… |
| country_code | char(2) NOT NULL FK geo.countries | |
| version | int NOT NULL DEFAULT 1 | |
| created_at / updated_at / deleted_at | | |

**Contraintes** : `uq_profiles_user UNIQUE(user_id)` ; `ck_profiles_rating (rating_avg BETWEEN 0 AND 5)`.
**Index** : `idx_profiles_rating(status, country_code, rating_avg desc)` (listing "populaires") ; `idx_profiles_verified(verified) WHERE status='ACTIVE'` (partiel).
**Justification** : agrégats dénormalisés (`rating_avg`, `completed_jobs`, `trust_score`) — calculés à la clôture/à l'avis/par le job de réputation, jamais à la volée (performance §11.5).

## `pros.services`
**Rôle** : services offerts par un pro (un pro peut exercer plusieurs métiers).

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| professional_id | uuid NOT NULL FK pros.profiles | |
| category_id | uuid NOT NULL FK pros.categories | catégorie **feuille** |
| title | varchar(160) NOT NULL | |
| description | text NULL | |
| price_from | numeric(14,2) NULL | |
| price_to | numeric(14,2) NULL | |
| price_unit | varchar(24) NULL | `PER_M2`, `PER_DAY`, `PER_JOB`… |
| is_primary | boolean NOT NULL DEFAULT false | un seul vrai |
| sort_order | int NOT NULL DEFAULT 0 | |
| created_at / updated_at / deleted_at | | |

**Contraintes** : `ck_services_price (price_to IS NULL OR price_to >= price_from)`.
**Index** : `idx_services_category(category_id, is_primary)`.
**Justification** : la recherche pro→service et la recherche par catégorie passent par cette table ; c'est elle qui relie la fiche à l'arborescence.

## `pros.locations`
**Rôle** : localisation + zone d'intervention d'un pro (exigence PostGIS).

| Colonne | Type | Notes |
|---|---|---|
| professional_id | uuid PK FK pros.profiles | 1 pro = 1 position principale |
| country_code | char(2) NOT NULL FK geo.countries | |
| division_id | uuid NULL FK geo.divisions | ville/quartier déclaré |
| location | geography(Point,4326) NOT NULL | position d'intervention |
| service_radius_km | numeric(6,2) NOT NULL DEFAULT 10 | rayon d'intervention |
| address_text | text NULL | |
| updated_at | | |

**Index** : GiST `idx_pros_locations_gist(location)` — **index spatial de la recherche par rayon** (§11.2).
**Justification** : la recherche de proximité est le cœur produit ; ce couple (point + rayon) alimente `ST_DWithin`.

## `pros.coverage_areas`
**Rôle** : zones d'intervention d'un pro via `geo.areas` — rayons, polygones ou communes entières (ajustement 7).

| Colonne | Type | Notes |
|---|---|---|
| professional_id | uuid NOT NULL FK pros.profiles | |
| area_id | uuid NOT NULL FK geo.areas | |
| created_at | timestamptz NOT NULL | |

**Contraintes** : `PK (professional_id, area_id)`.
**Justification** : "J'interviens dans le cercle de 10 km autour de Cotonou **et** toute la commune de Calavi" = 2 lignes. L'éligibilité se teste par `ST_Intersects` (point client vs zone).

## `pros.business_hours`
**Rôle** : horaires hebdomadaires (PRD §9 — Horaires).

| Colonne | Type | Notes |
|---|---|---|
| professional_id | uuid NOT NULL FK pros.profiles | |
| weekday | smallint NOT NULL | 1..7 (ISO, CHECK) |
| open_at | time NOT NULL | |
| close_at | time NOT NULL | |
| closed | boolean NOT NULL DEFAULT false | jour fermé |

**Contraintes** : `PK (professional_id, weekday)` ; `ck_business_hours_weekday (weekday BETWEEN 1 AND 7)` ; `ck_business_hours_open (close_at > open_at)`.
**Justification** : affichage "Ouvert maintenant" sans calcul lourd ; base du champ "disponibilité" du filtre recherche.

## `pros.availability_slots` (récurrents)
**Rôle** : créneaux de disponibilité hebdomadaires (PRD §16 Rendez-vous).

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| professional_id | uuid NOT NULL FK pros.profiles | |
| weekday | smallint NOT NULL | 1..7 |
| start_time | time NOT NULL | |
| end_time | time NOT NULL | |
| active | boolean NOT NULL DEFAULT true | |
| created_at | timestamptz NOT NULL | |

**Index** : `idx_availability_pro(professional_id, weekday)`.
**Justification** : les créneaux récurrents alimentent le calendrier ; les exceptions sont dans `availability_overrides`.

## `pros.availability_overrides`
**Rôle** : exceptions ponctuelles (congés, indisponibilité).

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| professional_id | uuid NOT NULL FK pros.profiles | |
| date | date NOT NULL | |
| start_time | time NULL | NULL = journée entière |
| end_time | time NULL | |
| reason | varchar(64) NULL | `VACATION`, `BUSY`, `CUSTOM` |
| created_at | timestamptz NOT NULL | |

**Index** : `idx_overrides_pro_date(professional_id, date)`.
**Justification** : "Indisponible cette semaine" = 1 ligne, sans réécrire le planning.

## `pros.reputation`
**Rôle** : métriques du Trust Score (ajustement 2 — `06d-revue-schema.md` §2). 1:1 avec le profil.

| Colonne | Type | Notes |
|---|---|---|
| professional_id | uuid PK FK pros.profiles | |
| completed_jobs | int NOT NULL DEFAULT 0 | nombre de missions |
| acceptance_rate | numeric(5,2) NULL | devis acceptés / envoyés |
| cancellation_rate | numeric(5,2) NULL | annulations après sélection |
| avg_response_min | int NULL | délai moyen de réponse aux besoins |
| punctuality_avg | numeric(2,1) NULL | issu des avis (ponctualité) |
| avg_execution_days | numeric(5,1) NULL | temps moyen d'exécution |
| disputes_count | int NOT NULL DEFAULT 0 | litiges pondérés |
| seniority_days | int NOT NULL DEFAULT 0 | ancienneté depuis activation |
| verification_level | smallint NOT NULL DEFAULT 0 | 0..3 (aucune → CIN → docs → badge) |
| ai_factor | numeric(5,2) NULL | futur : poids IA/recommandations (P3) |
| trust_score | numeric(3,2) NOT NULL DEFAULT 0 | composite 0..5 (formule configurable) |
| trust_level | varchar(16) NOT NULL DEFAULT 'NEW' | `NEW`, `LOW`, `MEDIUM`, `HIGH`, `EXCELLENT` |
| recomputed_at | timestamptz NOT NULL | |
| created_at / updated_at | | |

**Index** : `idx_reputation_score(trust_score desc)` (tri "les plus fiables").
**Justification** : la note seule ne suffit pas (ajustement 2) ; chaque métrique est **dérivée des tables existantes** (quotes, bookings, reviews, disputes) — la table est un cache calculé par job nocturne + événements structurants ; `trust_score` est copié sur `pros.profiles` pour le tri de recherche.

## `pros.portfolio_items` — **SUPPRIMÉ** → remplacé par `media.files`
Le portfolio (photos, vidéos, avant/après, documents — PRD §10) est géré par la table générique `media.files` (owner_type=`PROFESSIONAL`, purpose=`PORTFOLIO`/`BEFORE_AFTER`) — voir `06b-tables-mvp-market.md` §8 et `06d-revue-schema.md` §5. Aucune perte : le tri (`sort_order`), les types et les URLs sont conservés dans les lignes `media.files`.

## `pros.certifications`
**Rôle** : diplômes/certifications (PRD §21 Vérification).

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| professional_id | uuid NOT NULL FK pros.profiles | |
| name | varchar(160) NOT NULL | |
| issuer | varchar(160) NULL | |
| media_id | uuid NULL FK media.files | fichier (diplôme scanné) — ajustement 5 |
| verified | boolean NOT NULL DEFAULT false | |
| created_at | timestamptz NOT NULL | |

**Justification** : affichage "Certifié" sur la fiche ; contrôlé par la modération. Le fichier vit dans `media.files`.

## `pros.verifications`
**Rôle** : dossiers de vérification d'identité (CIN, selfie, documents) — PRD §21.

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| professional_id | uuid NOT NULL FK pros.profiles | |
| type | varchar(24) NOT NULL | `NATIONAL_ID`, `SELFIE`, `PRO_DOCUMENT`, `DIPLOMA` |
| media_id | uuid NOT NULL FK media.files | fichier — ajustement 5 |
| status | varchar(32) NOT NULL | `PENDING`, `APPROVED`, `REJECTED` |
| reviewed_by | uuid NULL FK users.users | admin |
| reviewed_at | timestamptz NULL | |
| note | text NULL | motif de rejet |
| created_at | timestamptz NOT NULL | |

**Index** : `idx_verifications_status(status)` (file de modération) ; `idx_verifications_pro(professional_id)`.
**Justification** : le badge vérifié (PRD §9) n'est accordé qu'après approbation manuelle — chaque décision est tracée (audit) ; les fichiers sont centralisés dans `media.files`.

---

# 5. Schéma `ai` — préparé (ADR-021, colonnes prêtes dès le MVP)

## `ai.recommendation_jobs`
**Rôle** : trace des recommandations servies (audit + amélioration du modèle).

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid NOT NULL FK users.users | |
| context | jsonb NOT NULL | catégorie, position, historique |
| results | jsonb NOT NULL | ids recommandés ordonnés |
| model | varchar(64) NOT NULL | `heuristic` au MVP |
| created_at | timestamptz NOT NULL | |

**Index** : `idx_rec_jobs_user(user_id, created_at desc)`.
**Justification** : sans ces traces, aucun apprentissage ni évaluation possible en Phase 3.

## `ai.embeddings`
**Rôle** : vecteurs sémantiques des contenus (recherche IA future).

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| entity_type | varchar(32) NOT NULL | `PROFILE`, `SERVICE`, `REQUEST` |
| entity_id | uuid NOT NULL | |
| model | varchar(64) NOT NULL | |
| vector | vector(768) NOT NULL | pgvector |
| created_at | timestamptz NOT NULL | |

**Contraintes** : `uq_embeddings UNIQUE(entity_type, entity_id, model)`.
**Index** : `idx_embeddings_hnsw (vector vector_hnsw_ops)` (créé à l'activation).
**Justification** : table créée dès le départ (extension pgvector) pour ne **rien** changer en Phase 3.

## `ai.pricing_estimates`
**Rôle** : suggestions de prix aux pros (PricingPort).

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| category_id | uuid NOT NULL FK pros.categories | |
| params | jsonb NOT NULL | surface, type, ville… |
| price_min | numeric(14,2) NOT NULL | |
| price_max | numeric(14,2) NOT NULL | |
| confidence | numeric(3,2) NULL | |
| model | varchar(64) NOT NULL | |
| created_at | timestamptz NOT NULL | |

**Index** : `idx_pricing_category(category_id, created_at desc)`.
**Justification** : "combien coûte la pose de 150 m² ?" est l'une des questions les plus fréquentes ; l'historique sert l'analyse de prix (PRD §22).

## `ai.fraud_scores`
**Rôle** : scores de risque (FraudDetectionPort — ADR-022).

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| entity_type | varchar(32) NOT NULL | `USER`, `TRANSACTION`, `REVIEW` |
| entity_id | uuid NOT NULL | |
| score | numeric(3,2) NOT NULL | 0..1 |
| reason | jsonb NULL | facteurs détectés |
| model | varchar(64) NOT NULL | |
| created_at | timestamptz NOT NULL | |

**Index** : `idx_fraud_entity(entity_type, entity_id, created_at desc)`.
**Justification** : les règles MVP (OTP, cooldowns, empreintes) alimenteront ce score ; le modèle IA s'y branchera sans refonte.

## `ai.chat_sessions`
**Rôle** : sessions de l'assistant conversationnel (AssistantPort, P3).

| Colonne | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid NOT NULL FK users.users | |
| context | jsonb NOT NULL DEFAULT '{}' | |
| ended_at | timestamptz NULL | |
| created_at | timestamptz NOT NULL | |

**Index** : `idx_chat_sessions_user(user_id, created_at desc)`.
**Justification** : préparation légère (une seule table) pour l'assistant ; les messages suivront les règles du module messagerie.
