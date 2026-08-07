# 4.1 — Backend Blueprint (NestJS / Nx)

Version : 1.0 — Étape 4. **Aucun code.** Contrats de conception par module.
Conventions (rappel `01-architecture-globale.md` + `04-arborescence-projet.md`) :
Clean Architecture 4 couches, DDD, monolithe modulaire (ADR-001), schéma PG par
module, Outbox (ADR-016), événements de domaine (ajustement 1), TimeProvider
injecté (ADR-002), SearchPort (ADR-003), PaymentPort/NotificationPort/StoragePort
(ADR-015/016/017).

Gabarit de contrat par module (10 champs exigés par bug.md) :
`Responsabilités · Cas d'utilisation · Services · Ports · Adaptateurs ·
Événements · DTO · Validations · Erreurs · Permissions`.

Règles transverses (applicables à tous les modules) :
- Chaque use-case est une classe unique, testable, sans décorateur NestJS.
- Les DTO entrant sont validés par `class-validator` à la couche présentation.
- Erreurs : `DomainError` typés + codes HTTP (voir `12-api-blueprint.md`).
- Événements publiés via l'Outbox (transactionnel, jamais dans le use-case).
- Toute écriture : transaction + événement dans `audit.aggregate_events`.
- Identifiants : UUID v4. Horodatage UTC. `country_code` obligatoire (ADR-009/013).

---

## MOD-01 — auth (schéma `auth`)

**Responsabilités** : identité et sessions. Inscription OTP, connexion, refresh rotatif, rôles, verrouillage, 2FA admin (TOTP), journalisation de connexion (sécurité).

**Cas d'utilisation** : `RegisterWithOtp` · `LoginWithOtp` · `RefreshSession` · `Logout` (révocation) · `VerifyDevice` (nouvelle connexion → NT-017) · `AdminTOTPLogin` · `ResendOtp` · `LockAccount` (seuils).

**Services** : `OtpService` (génération, vérification, cooldown 45 s, 3 essais/code, max 5 envois/15 min) · `TokenService` (access 15 min, refresh rotatif 30 j, family + rotation detection) · `SessionService` (liste sessions actives, révocation) · `RiskService` (vélocité OTP, IP, device).

**Ports** : `OtpSenderPort` (envoi) · `TokenManagerPort` · `SessionRepositoryPort` · `UserRepositoryPort` (externe : créé par users) · `EventPublisherPort`.

**Adaptateurs** : `SmsOtpAdapter` (fournisseur SMS Bénin — SMS-001) · `JwtAdapter` · `RedisSessionAdapter` (blacklist + family) · `TypeOrmSessionRepository`.

**Événements** : `auth.user.registered` · `auth.user.logged_in` · `auth.user.locked` · `auth.session.revoked` · `auth.otp.attempt_failed`.

**DTO** : `RequestOtpDto {phone, country_code}` · `VerifyOtpDto {phone, code, device?}` · `RefreshDto {refresh_token}` · `AdminLoginDto {email, password}` · `AdminVerifyDto {email, totp}`.

**Validations** : téléphone normalisé (E.164, +229…) · code 6 chiffres · cooldown 45 s · 3 essais/code · max 5 envois/15 min → verrouillage 15 min · refresh : famille cohérente sinon rotation détectée → révocation totale.

**Erreurs** : `PhoneInvalid` (422) · `OtpInvalid` (401) · `OtpExpired` (401 + resend) · `AccountLocked` (423) · `RefreshReused` (401 + revoke-all) · `DeviceUntrusted` (428 — après NT-017).

**Permissions** : public (register/login/refresh) ; `admin` uniquement pour AdminLogin.

---

## MOD-02 — users (schéma `users`)

**Responsabilités** : profils client, préférences, consentements, favoris, adresses, RGPD (export/anonymisation/suppression), paramètres notifications.

**Cas d'utilisation** : `CreateProfile` · `UpdateProfile` · `ToggleFavorite` · `ListFavorites` · `ManageConsents` (DLG-009) · `RequestDataExport` (EM-006) · `AnonymizeAccount` · `DeleteAccount` (DLG-010, 2 étapes) · `UpdateSettings` · `ManageAddresses`.

**Services** : `ConsentService` (versionnement des consentements) · `RgpdService` (jobs export/suppression) · `FavoriteService`.

**Ports** : `UserRepositoryPort` · `ConsentRepositoryPort` · `ExportJobPort` · `AnonymizationPort` · `EventPublisherPort`.

**Adaptateurs** : `TypeOrmUserRepository` · `R2StorageExportAdapter` (fichier export JSON/PDF) · `JobQueueAdapter` (BullMQ) · `TypeOrmConsentRepository`.

**Événements** : `users.profile.created` · `users.profile.updated` · `users.favorite.added` · `users.favorite.removed` · `users.consent.changed` · `users.export.requested` · `users.deleted` (→ purge planifiée 30 j) · `users.anonymized`.

**DTO** : `CreateProfileDto {name, role}` · `UpdateProfileDto {name?, avatar_id?, address?}` · `ToggleFavoriteDto {professional_id}` · `UpdateConsentsDto {cgv, privacy, marketing}` · `ExportDto {format}` · `DeleteAccountDto {password|otp}`.

**Validations** : nom 2-80 car. · consentements requis (CGV obligatoire, DLG-009) · suppression : mot de passe ou OTP + saisie « SUPPRIMER » · un favori par couple (uq).

**Erreurs** : `ProfileNotFound` (404) · `ConsentRequired` (403) · `InvalidDeleteConfirmation` (422) · `ExportPending` (409, déjà demandé).

**Permissions** : `client` / `professional` (profil propre) ; `admin` : consultation (SCR-126) mais jamais lecture de données sensibles en clair (chiffrement).

---

## MOD-03 — professionals (schéma `pros`)

**Responsabilités** : vitrine pro (profil, services, portfolio), vérification + badge, disponibilités/créneaux (anti double réservation), Trust Score + réputation, zones de couverture.

**Cas d'utilisation** : `CreateProfessionalProfile` · `UpdateProfile` · `ManageServices` · `ManagePortfolio` (médias, avant/après) · `SubmitVerification` (CIN + selfie) · `ApproveVerification` / `RejectVerification` (admin) · `ManageAvailability` (créneaux hebdo + overrides) · `GetAvailableSlots(proId, période)` · `ComputeTrustScore` (job) · `SetCoverageAreas` · `GetStats`.

**Services** : `VerificationService` (workflow PENDING → APPROVED/REJECTED, NT-014/015) · `AvailabilityService` (génération de slots, verrouillage `FOR UPDATE` + `tsrange` overlap — ajustement 4) · `ReputationService` (score 0-5, job + événements — ajustement 2) · `PortfolioService`.

**Ports** : `ProfessionalRepositoryPort` · `AvailabilityRepositoryPort` · `ReputationRepositoryPort` · `VerificationRepositoryPort` · `MediaStoragePort` (upload signé) · `GeoBoundaryPort` (zones) · `EventPublisherPort`.

**Adaptateurs** : `TypeOrmProfessionalRepository` · `PostgresAvailabilityRepository` (`FOR UPDATE`, overlap) · `R2StorageAdapter` (presigned URLs, CIN chiffré) · `TypeOrmReputationRepository`.

**Événements** : `pros.profile.created` · `pros.profile.updated` · `pros.verification.submitted` · `pros.verification.approved` · `pros.verification.rejected` · `pros.slot.created` · `pros.slot.booked` (consommé par requests) · `pros.reputation.recomputed` · `pros.coverage.updated`.

**DTO** : `CreateProDto {type, name, category_id, bio, city_id, …}` · `ServiceDto {category_id, price_min, price_max, unit}` · `AvailabilityDto {weekday, start, end}` · `OverrideDto {date, reason}` · `VerificationDto {id_card_id, selfie_id}` · `CoverageDto {area_ids[]}`.

**Validations** : prix cohérents (min ≤ max, > 0) · créneaux sans chevauchement · vérification : CIN + selfie obligatoires, fichiers chiffrés · badge conditionné à APPROVED · suspension → fiche inaccessible (SCR-011).

**Erreurs** : `ProfessionalNotFound` (404) · `NotVerified` (403, badge) · `SlotConflict` (409, créneau pris) · `VerificationPending` (409) · `CoverageOutOfBounds` (422).

**Permissions** : `professional` (gestion propre) ; `admin` (approbation/rejet, SCR-122) ; lecture publique (fiche).

---

## MOD-04 — categories (schéma `market`)

**Responsabilités** : arborescence 2 niveaux (groupe → sous-catégories), traduction (jsonb), icônes, ordre, cycles de vie.

**Cas d'utilisation** : `ListCategories` (arbre, par pays) · `GetCategory` · `CreateCategory` (admin) · `UpdateCategory` · `DeactivateCategory`.

**Services** : `CategoryService` (cache Redis 24 h — invalidé par événement).

**Ports** : `CategoryRepositoryPort` · `CachePort` · `EventPublisherPort`.

**Adaptateurs** : `TypeOrmCategoryRepository` · `RedisCacheAdapter`.

**Événements** : `categories.created` · `categories.updated` · `categories.deactivated` (→ invalidation cache + recherche).

**DTO** : `CreateCategoryDto {parent_id?, names{fr,en}, icon, order}` · `UpdateCategoryDto {…}`.

**Validations** : nom traduit fr obligatoire · profondeur ≤ 2 · pas de suppression si pros liés (déactivation seulement).

**Erreurs** : `CategoryNotFound` (404) · `CategoryInUse` (409) · `DepthExceeded` (422).

**Permissions** : lecture publique ; écriture `admin` uniquement (SCR-129).

---

## MOD-05 — geolocation (schéma `geo`)

**Responsabilités** : découpage administratif multi-pays (ADR-013, `ltree`), reverse geocoding (OSM), calcul de distance (PostGIS), zones géo (cercle/polygone — ajustement 7).

**Cas d'utilisation** : `GetCountries` · `GetDivisions(country)` · `ReverseGeocode(lat, lon)` · `DistanceBetween` · `CreateArea` (admin) · `FindAreasAt(point)`.

**Services** : `GeoService` · `ReverseGeocodingService` (cache Redis 30 j).

**Ports** : `GeoRepositoryPort` · `ReverseGeocoderPort` (interne : cache d'abord) · `MapsProviderPort` (OSM Nominatim, bascule possible) · `EventPublisherPort`.

**Adaptateurs** : `PostgisGeoRepository` (`ST_DWithin`, `ST_DistanceSphere`, `ltree` navigation) · `NominatimAdapter` (rate-limit respecté, cache) · `RedisCacheAdapter`.

**Événements** : `geo.country.added` · `geo.area.created`.

**DTO** : `ReverseGeocodeDto {lat, lon}` · `CreateAreaDto {type(circle|polygon|division), geometry}`.

**Validations** : lat ∈ [-90, 90], lon ∈ [-180, 180] · polygone fermé et simple · division rattachée à un pays actif.

**Erreurs** : `InvalidCoordinates` (422) · `AreaNotFound` (404) · `NominatimUnavailable` (503 → cache).

**Permissions** : lecture publique (pays, divisions) ; admin pour les zones.

---

## MOD-06 — search (schéma `search`)

**Responsabilités** : recherche multi-critères sur la projection `search.pro_search_docs` (ajustement 3), filtres, tri, pagination keyset, autocomplétion, suggestions récentes, feed d'accueil.

**Cas d'utilisation** : `SearchPros(query, filters, page)` · `Autocomplete(q)` · `GetHomeFeed(position)` · `SuggestCategories` · `ConsumeOutboxEvent(event)` (mise à jour de la projection).

**Services** : `SearchQueryService` (PG plein texte + trigramme + PostGIS, bascule ES possible via `SearchPort` sans refonte) · `FeedService` (agrégats cache Redis, hot data) · `OutboxConsumer`.

**Ports** : `SearchRepositoryPort` (projection) · `SearchEnginePort` (futur ES/Meilisearch — ADR-003) · `CachePort` · `EventPublisherPort`.

**Adaptateurs** : `PostgresSearchAdapter` (tsvector GIN, trgm, keyset) · `RedisFeedAdapter`.

**Événements** : consomme tous les événements métier (requests, pros, reviews, availability) ; émet `search.projection.updated`.

**DTO** : `SearchQueryDto {q?, categories?, lat?, lon?, radius_km?, min_rating?, price_min?, price_max?, available_today?, verified?, page?}` · `Sort {pertinence|distance|note|prix}`.

**Validations** : rayon 1-50 km · tri compatible keyset · page ≤ 100 · q ≤ 100 car.

**Erreurs** : `InvalidRadius` (422) · `InvalidSort` (422) · `ProjectionLag` (503 léger, dégradé avec cache).

**Permissions** : public authentifié.

---

## MOD-07 — requests (schéma `market`) — le cœur du MVP

**Responsabilités** : cycle de vie du besoin et du devis (machine à états `06-schema-base.md` §10), négociation, sélection, réservation, double confirmation, litiges, expiration, annulation/réouverture.

**Cas d'utilisation** : `PublishRequest` (US-023) · `ExpireRequests` (job 48 h) · `QuoteRequest` (pro) · `CounterOffer` · `AcceptQuote` (sélection, DLG-003) · `CreateBooking` (créneau) · `ConfirmCompletion` (client/pro, double confirmation) · `OpenDispute` · `CancelRequest` (DLG-002) · `ReopenRequest` (DLG-012) · `ResolveDispute` (admin, SCR-124) · `ListRequests` / `ListQuotes` / `ListBookings` (par acteur).

**Services** : `RequestStateMachine` (transitions légales uniques — §10) · `MatchingService` (candidats à notifier NT-011/012 : catégorie + rayon) · `BookingService` (verrouillage créneau) · `DisputeService` (gel paiement) · `ExpirationService`.

**Ports** : `RequestRepositoryPort` · `QuoteRepositoryPort` · `BookingRepositoryPort` · `DisputeRepositoryPort` · `OutboxPort` · `MatchingPort` · `TimeProvider` (ADR-002).

**Adaptateurs** : `TypeOrmRequestRepository` (with FOR UPDATE sur transitions) · `OutboxPublisher` · `PostgresMatchingAdapter`.

**Événements** : `requests.published` · `requests.quoted` · `requests.negotiated` · `requests.selected` · `requests.booking_created` · `requests.completed` · `requests.cancelled` · `requests.reopened` · `requests.expired` · `requests.disputed` · `requests.dispute_resolved` · `requests.booking_slot_conflict`.

**DTO** : `PublishRequestDto {category_id, title, description, media_ids[], budget_min?, budget_max?, currency, currency_unit?, wanted_date?, urgent?, location{lat?, lon?, division_id?}, expires_hours?}` · `QuoteDto {price, currency, duration_days, message}` · `CounterOfferDto {price, message}` · `CreateBookingDto {quote_id, slot_start}` · `CompleteBookingDto {}` · `OpenDisputeDto {type, description, media_ids[]}` · `CancelDto {reason}`.

**Validations** : titre ≤ 160 · description ≤ 2000 · catégorie feuille · budget min ≤ max, même devise · date non passée · position ou division obligatoire · transitions selon machine à états (ex. reopen seulement avant paiement) · une seule contre-offre active à la fois.

**Erreurs** : `RequestNotFound` (404) · `IllegalTransition` (409) · `RequestExpired` (410) · `SlotConflict` (409) · `PaymentRequired` (402, sélection non payée) · `DisputeAlreadyOpen` (409) · `QuoteWithdrawn` (410).

**Permissions** : client = ses demandes ; pro = demandes matchées (catégorie + rayon + pays) ; admin = arbitrage (SCR-124) et modération.

---

## MOD-08 — messaging (schéma `msg`)

**Responsabilités** : conversations contextualisées (liées à une demande/booking), messages texte/média/position, temps réel (websocket Redis pub/sub), files d'attente hors-ligne, anti-spam.

**Cas d'utilisation** : `OpenConversation` · `SendMessage` · `ListConversations` · `ListMessages(keyset)` · `MarkRead` · `DeleteMessage` (RGPD) · `SubscribeConversation` (ws).

**Services** : `ConversationService` (auto-création liée à un booking/request) · `RealtimeService` (pub/sub + présence) · `AntiSpamService` (vélocité messages/min).

**Ports** : `ConversationRepositoryPort` · `MessageRepositoryPort` · `RealtimePort` · `MessageMediaPort` (S3) · `EventPublisherPort`.

**Adaptateurs** : `TypeOrmMessageRepository` · `RedisPubSubAdapter` · `WebsocketGateway` (Socket.IO ou native, selon benchmark — décision à l'Étape 5) · `R2StorageAdapter`.

**Événements** : `msg.conversation.opened` · `msg.message.sent` · `msg.message.read` · `msg.conversation.closed`.

**DTO** : `SendMessageDto {conversation_id, type(text|media|location), content?, media_id?, location?}` · `ListMessagesDto {cursor?}`.

**Validations** : texte ≤ 2000 · média via `media.files` vérifiée · conversation accessible aux 2 participants · rate limit 30 msg/min.

**Erreurs** : `ConversationNotFound` (403/404) · `ForbiddenParticipant` (403) · `SpamLimited` (429).

**Permissions** : participants uniquement ; admin (modération SCR-123) en lecture audit.

---

## MOD-09 — notifications (schéma `notif`)

**Responsabilités** : push FCM, in-app, emails, SMS de repli (multi-canal — ADR-016), préférences, template i18n, boîte de réception (SCR-016).

**Cas d'utilisation** : `SendNotification(channel, template, target)` (consommateur Outbox) · `ListInbox` · `MarkRead` · `MarkAllRead` · `ManagePreferences` · `RegisterDevice` (FCM token).

**Services** : `DispatchService` (canal principal + repli selon préférences) · `TemplateService` (i18n, variables) · `InboxService`.

**Ports** : `PushPort` · `EmailPort` · `SmsPort` · `InboxRepositoryPort` · `DeviceRepositoryPort` · `EventPublisherPort`.

**Adaptateurs** : `FcmAdapter` · `SmtpAdapter` (ou service transactionnel) · `SmsOtpAdapter` (réutilisé) · `TypeOrmInboxRepository`.

**Événements** : consomme tous les événements métier ; émet `notif.delivered`, `notif.failed`.

**DTO** : `RegisterDeviceDto {token, platform}` · `PreferencesDto {push, email, sms}` · `MarkReadDto {notification_id[]}`.

**Validations** : template existant · canal autorisé par préférences · déduplication (event_id) · retry ≤ 3.

**Erreurs** : `DeviceNotFound` (404) · `TemplateMissing` (500, config) · `ChannelDisabled` (202, repli fait).

**Permissions** : utilisateur = ses notifications ; aucune admin (journal seulement).

---

## MOD-10 — reviews (schéma `review`)

**Responsabilités** : avis post-prestation (5 critères — PRD §11), médias, modération, réponse du pro, calcul de réputation.

**Cas d'utilisation** : `CreateReview` (booking COMPLETED uniquement) · `ListReviews` (par pro, filtres note) · `ReportReview` (DLG-011) · `ModerateReview` (admin, SCR-123) · `RespondToReview` (pro, 1 max) · `UpdateTrustScore` (consommateur).

**Services** : `ReviewService` (une review par booking, pas de self-review) · `ModerationService` · `ReputationUpdater` (job + événements).

**Ports** : `ReviewRepositoryPort` · `MediaStoragePort` · `ModerationQueuePort` · `EventPublisherPort`.

**Adaptateurs** : `TypeOrmReviewRepository` · `R2StorageAdapter` · `TypeOrmModerationRepository`.

**Événements** : `reviews.created` · `reviews.moderated` · `reviews.reported` · `reviews.responded`.

**DTO** : `CreateReviewDto {booking_id, rating_overall, rating_punctuality, rating_quality, rating_value, rating_politeness, comment?, media_ids[]}` · `ReportDto {reason}` · `RespondDto {text}` · `ModerateDto {decision(hidden|kept), reason?}`.

**Validations** : 5 notes obligatoires 1-5 · commentaire ≤ 1000 · booking COMPLETED · une seule review · réponse ≤ 500 car., 1 max, aucun pro n'a noté un client (PRD).

**Erreurs** : `BookingNotCompleted` (409) · `ReviewAlreadyExists` (409) · `SelfReviewForbidden` (403).

**Permissions** : client = ses bookings ; pro = répondre aux siens ; admin = modération.

---

## MOD-11 — admin (schéma `admin` + `audit`)

**Responsabilités** : KPIs, files (validation, modération, signalements, litiges), gestion utilisateurs (suspension/bannissement), stats nationales, config plateforme (pays, devises, catégories, commission, seuils).

**Cas d'utilisation** : `GetDashboard` (KPIs pays) · `ApproveVerification`/`Reject` · `ModerateContent` · `HandleReports` · `SuspendUser`/`BanUser` (motif + durée) · `ResolveDispute` · `GetStats(country, period)` · `UpdatePlatformConfig` · `GetTransactionLog` (SCR-127) · `ExportCsv`.

**Services** : `DashboardService` (snapshots nightly — stats_snapshots) · `ModerationService` · `ConfigService` (versionné + audit) · `SanctionService` (NT-016).

**Ports** : `AdminRepositoryPort` (vues agrégées) · `SanctionRepositoryPort` · `ConfigRepositoryPort` · `EventPublisherPort`.

**Adaptateurs** : `TypeOrmAdminRepository` (lectures optimisées) · `TypeOrmSanctionRepository` · `TypeOrmConfigRepository`.

**Événements** : `admin.verification.decided` · `admin.content.moderated` · `admin.user.suspended` · `admin.user.banned` · `admin.dispute.resolved` · `admin.config.changed`.

**DTO** : `DecideDto {approve|reject, reason?}` · `SuspendDto {user_id, reason, duration}` · `ResolveDisputeDto {decision, refund_amount?, reason}` · `ConfigDto {…}`.

**Validations** : motif obligatoire pour reject/suspend/resolve · durée positive · décisions auditées (aggregate_events) · 2FA requis (SCR-120).

**Erreurs** : `AdminNotFound` (404) · `MissingReason` (422) · `DisputeAlreadyResolved` (409).

**Permissions** : `admin` strictement (tous les endpoints) ; actions sensibles → confirmation + audit.

---

## Bibliothèques partagées (libs/)

| Lib | Contenu | Modules clients |
|---|---|---|
| `core` | exceptions (`DomainError`), types, uuid, date utils, `TimeProvider`, `IdempotencyKey` | tous |
| `database` | DataSource TypeORM, migrations runner, convention nommage, triggers (updated_at) | tous |
| `redis` | client, cache TTL patterns, pub/sub, verrouillage distribué | plusieurs |
| `storage` | `StoragePort` + S3/R2/MinIO adapters, presigned URLs, chiffrement | pros, requests, reviews, messaging |
| `notifications` | `PushPort`/`EmailPort`/`SmsPort` adapters partagés | notifications |
| `outbox` | publisher transactionnel + consumer (BullMQ/Redis streams) | tous (écritures) |
| `maps` | `MapsProviderPort`, Nominatim adapter, cache | geolocation, search |
| `testing` | factories, mocks, testcontainers helpers | tous (tests) |

## Règles de développement en parallèle

1. Un développeur = un module (1 branche = 1 module). Aucun conflit de schéma : 1 migration par module.
2. Contrats inter-modules = interfaces pures (`ports`). Interdiction d'importer l'implémentation d'un autre module.
3. Les événements sont la seule passerelle inter-modules (Outbox) ; pas d'appel synchrone inter-modules si un événement suffit.
4. Chaque use-case = fichier unique `*.use-case.ts` + test unitaire associé (couverture ≥ 80 % sur le module).
5. La commande de génération de module (scaffold Nx) inclut les 4 couches + migrations + tests, conforme à `04-arborescence-projet.md`.
