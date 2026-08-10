# Cadrage contractuel — Sous-lot 6.3.4 : écritures vitrine pro (`PUT /api/v1/professionals/me` + services, horaires, localisation)

> Livrable de cadrage (méthode bug.md) avant implémentation.
> Périmètre : écriture de la **vitrine professionnelle du propriétaire authentifié**
> (suite directe de 6.3.3 `GET /professionals/me`).
> Sources : `12-api-blueprint.md` L209 (FCT-021/022 : `PUT /professionals/me`, CRUD `/services`,
> `…/business_hours`, `…/location`), `10-blueprint-backend.md` MOD-03 (UpdateProfile,
> ManageServices, événement `pros.profile.updated`), `06a §4` (tables pros), `06-schema-base.md`
> §6 (versionnement optimiste), `20-catalogue-benin.md` CAT-001/002/003/006, `34` (pattern
> écriture 6.3.2 : version + événement), `35` (règles 6.3.3, projection `ProfessionalMeResponse`).
> Aucun portfolio, aucune vérification, aucune disponibilité/créneaux, aucun RGPD ici.

---

## 1. Objectif et périmètre

- US-053/054 (07g) : le professionnel complète sa fiche vitrine (identité commerciale),
  publie ses services (métiers + prix), ses horaires d'ouverture et sa localisation.
- Le professionnel connecté **écrit** sa vitrine : mise à jour de la fiche, des services,
  du jeu hebdomadaire d'horaires et de la position d'intervention. Lecture toujours via
  `GET /professionals/me` (6.3.3).
- **Hors périmètre 6.3.4** (sous-lots suivants, pas de migration ici) :
  portfolio upload presigné (6.3.5), vérifications CIN (6.3.5), RGPD (6.3.6),
  `POST /professionals/me/coverage-areas` (table `pros.coverage_areas` + `geo.areas`
  **absentes de la migration 001** — sous-lot ultérieur avec migration),
  disponibilités/créneaux `availability` (FCT-022, table `pros.availability_slots`,
  aussi absente de la migration 001), fiche publique (FCT-007).

## 2. Règles fonctionnelles (verrouillées)

| ID | Règle |
|---|---|
| RF-PW-W01 | Requêtes `Authorization: Bearer <access_token>` (AuthGuard exporté par AuthModule, D-ME-3) ; `sub` = `user_id`. |
| RF-PW-W02 | **404 `professional_not_found`** pour tout utilisateur authentifié dont le rôle ≠ `PROFESSIONAL` ou dont `pros.profiles` n'existe pas (règle de non-dévoilement 6.3.3 RF-PW02, réutilisée — même 404 que la lecture). |
| RF-PW-W03 | Compte `BANNED`/`SUSPENDED` (users) ou fiche `SUSPENDED` → 403 `account_locked` ; compte `anonymized_at` posé → 403 `resource_unavailable` (RGPD) ; fiche `DRAFT`/`PENDING_VERIFICATION`/`ACTIVE` → écriture **autorisée** (le pro complète sa vitrine avant/après vérification, BR-013). |
| RF-PW-W04 | **`PUT /professionals/me`** : remplacement des champs modifiables de la fiche avec **verrouillage optimiste** (`version` lue via `GET /professionals/me`, même mécanisme que 6.3.2 RF-ME-W04, colonne `pros.profiles.version`). Version obsolète → 409 `version_conflict`. Champs modifiables : `business_name`, `headline`, `description`, `experience_years`, `employees_count`, `min_price`, `website`, `social_links`. **Immutables** : `id`, `user_id`, `status`, `verified`/`verified_at`, `rating_avg`/`rating_count`/`completed_jobs`/`trust_score` (agrégats, 06a §15), `currency`, `country_code`, `version` (lu seulement). |
| RF-PW-W04b | **Version globale de la vitrine (verrou bug.md)** : `pros.profiles.version` est le verrou de **toutes** les mutations de la vitrine — fiche, services, horaires **et** localisation. Chaque commande porte `version` (lu via GET) ; chaque mutation réussie incrémente `version` de 1 (même transaction). Deux appareils modifiant simultanément des parties différentes de la vitrine ne s'écrasent pas silencieusement : le second reçoit 409 `version_conflict` et relit. |
| RF-PW-W05 | **Services** (pros.services, CAT-003) : `POST /professionals/me/services` (création, 201), `PUT /professionals/me/services/:id` (remplacement, 200), `DELETE /professionals/me/services/:id` (200). Champs : `category_id` (uuid, **catégorie feuille + `active`** — CAT-001/002), `title` (2-160), `description` (≤ 2000, nullable), `price_from` (≥ 0, nullable), `price_to` (nullable, **≥ price_from** — CHECK DB), `price_unit` (`PER_M2`/`PER_DAY`/`PER_HOUR`/`PER_JOB`/`PER_MEAL`, CAT-006, nullable), `is_primary` (bool, défaut false), `sort_order` (int ≥ 0, défaut 0). Toutes les commandes service portent `version` (RF-PW-W04b). |
| RF-PW-W06 | **Un seul `is_primary`** (06a §16, « un seul vrai », verrou bug.md) : si une écriture service met `is_primary = true`, les autres services du même pro passent `is_primary = false` **dans la même transaction** (max 1 principal après l'opération). Désactiver le primary (`false` explicite) n'en désigne aucun autre automatiquement. |
| RF-PW-W06b | **Suppression du service principal (verrou bug.md)** : `DELETE` d'un service `is_primary = true` → **aucune promotion automatique**. Après suppression, le pro a **zéro** service principal jusqu'à ce qu'il en désigne un lui-même (aucune réaffectation silencieuse). |
| RF-PW-W07 | **Catégorie** : `category_id` inconnue → 404 `category_not_found` ; catégorie non-feuille (parent_id NULL) ou `active = false` → 422 `category_not_assignable` (CAT-001/002, erreurs du module professionals). |
| RF-PW-W08 | **`PUT /professionals/me/business_hours`** : **remplacement atomique du jeu hebdomadaire** (verrou bug.md — soit toute la semaine est acceptée, soit rien ne change ; 0-7 lignes, `pros.business_hours`, PK `professional_id + weekday`, tout dans une transaction). Chaque élément : `weekday` (1-7 ISO, **unique** dans le body — pas de chevauchement possible, PK), `open_at`/`close_at` (HH:MM:SS, **close > open** — CHECK DB), `closed` (bool, défaut false ; jour fermé = ligne conservée avec `closed: true`). Jeu invalide (weekday hors 1-7, doublon, close ≤ open) → 422 `business_hours_invalid` (validation sémantique) ; format `time` invalide → 400 (ValidationPipe). Porte `version` (RF-PW-W04b). |
| RF-PW-W09 | **`PUT /professionals/me/location`** : **remplacement de la position unique** (`pros.locations`, PK `professional_id`). Champs : `lat` (-90…90), `lon` (-180…180), `division_id` (uuid **obligatoirement existant dans `geo.divisions`** sinon 404 `division_not_found`, nullable), `service_radius_km` (numeric > 0, défaut 10), `address_text` (≤ 500, nullable). `country_code` non modifiable (pays du compte). **Conversion vers `GEOMETRY(Point,4326)` (`ST_SetSRID(ST_MakePoint(lon, lat), 4326)`) uniquement dans l'adaptateur infrastructure** (verrou bug.md — le port/service manipulent des nombres). Upsert 1:1 (insert ou update selon existence). Porte `version` (RF-PW-W04b). |
| RF-PW-W10 | **Réponse de chaque écriture réussie** : **200/201 + projection complète `ProfessionalMeResponse`** (35 §4, inchangée, `version` à jour) — cohérent avec 6.3.2 (retour de la projection complète), le client dispose toujours d'une vue à jour et du nouveau `version` pour la suite. Pas de 204. |
| RF-PW-W11 | **Événements** (10 MOD-03, D-EVT-1 émission synchrone MVP) : **`pros.profile.updated`** après **chaque** mutation réussie (fiche, services, horaires, localisation) avec payload `{ professional_id, user_id, version }` + champs impactés. **Uniquement après le commit de la transaction** (verrou bug.md) : l'événement ne part jamais pendant une transaction susceptible d'être rollbackée, et jamais sur échec. Au MVP (D-EVT-1, publisher console — aucun mécanisme outbox transactionnel existant) l'émission se fait après le commit, dans l'adaptateur/serveur ; l'outbox transactionnelle relève d'un lot ultérieur. |
| RF-PW-W12 | **Transactions** : chaque écriture est atomique (une transaction par mutation) ; le basculement `is_primary` (W06) et le remplacement horaires (DELETE + INSERT) y sont inclus. |
| RF-PW-W13 | **Perf** (bug.md, cohérent RF-PW09) : écritures ≤ 3 requêtes indexées ; la projection de réponse réutilise les 2-4 lectures 6.3.3 (pas de jointure géante). |

## 3. Contrat API

### 3.1 `PUT /api/v1/professionals/me`

```http
PUT /api/v1/professionals/me
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "business_name": "Plomberie SOS",
  "headline": "Plombier 15 ans Cotonou",
  "description": "Dépannage rapide et devis gratuit",
  "experience_years": 15,
  "employees_count": 3,
  "min_price": 5000,
  "website": "https://plomberie-sos.bj",
  "social_links": { "whatsapp": "229-97000000" },
  "version": 1
}
```

### 3.2 `POST /api/v1/professionals/me/services` · `PUT/DELETE /api/v1/professionals/me/services/:id`

```json
{
  "category_id": "…",
  "title": "Dépannage urgent",
  "description": "Intervention 24h/24",
  "price_from": 5000,
  "price_to": 15000,
  "price_unit": "PER_JOB",
  "is_primary": true,
  "sort_order": 0,
  "version": 1
}
```

### 3.3 `PUT /api/v1/professionals/me/business_hours`

```json
{
  "version": 1,
  "hours": [
    { "weekday": 1, "open_at": "08:00:00", "close_at": "18:00:00", "closed": false },
    { "weekday": 6, "open_at": "10:00:00", "close_at": "14:00:00", "closed": true }
  ]
}
```

### 3.4 `PUT /api/v1/professionals/me/location`

```json
{
  "version": 1,
  "lat": 6.438544,
  "lon": 2.350294,
  "division_id": "…",
  "service_radius_km": 10,
  "address_text": "Rue des Artisans, Sèmè-Podji"
}
```

### Réponses communes

| Code | Corps | Quand |
|---|---|---|
| 200 | `ProfessionalMeResponse` (35 §4) | PUT fiche / PUT service / DELETE service / PUT hours / PUT location |
| 201 | `ProfessionalMeResponse` | POST service |
| 400 | `statusCode/message` (pipe global) | champ interdit (`forbidNonWhitelisted`) ou format invalide (ex. `time`, `email`-like, bornes lat/lon) |
| 401 | `unauthorized` / `token_expired` | Bearer absent/malformé/expiré/sub inconnu |
| 403 | `account_locked` | user BANNED/SUSPENDED ou fiche SUSPENDED |
| 403 | `resource_unavailable` | compte anonymisé |
| 404 | `professional_not_found` | rôle ≠ PROFESSIONAL ou fiche absente (RF-PW-W02) |
| 404 | `service_not_found` | PUT/DELETE service avec id inconnu du pro |
| 404 | `category_not_found` | category_id inconnue (RF-PW-W07) |
| 404 | `division_not_found` | division_id inconnu dans `geo.divisions` (RF-PW-W09) |
| 409 | `version_conflict` | version du body ≠ version en base (toute mutation, RF-PW-W04b) |
| 422 | `category_not_assignable` | catégorie non-feuille ou inactive (RF-PW-W07) |
| 422 | `business_hours_invalid` | weekday doublon/hors 1-7, close ≤ open (RF-PW-W08) |

## 4. `ProfessionalMeResponse`

Réponse de sortie **inchangée** : docs/35 §4 (§4.1-4.5) — aucune divergence de
projection entre 6.3.3 et 6.3.4. `version` relue après chaque écriture (W10).

## 5. Contrat de service

```
ProfessionalsController (PUT /professionals/me, POST/PUT/DELETE /professionals/me/services[/:id],
                          PUT /professionals/me/business_hours, PUT /professionals/me/location,
                          @UseGuards(AuthGuard), @CurrentUser())
        ↓
ProfessionalShowcaseService (getMe + updateMe + createService + updateService + deleteService
                             + replaceBusinessHours + upsertLocation)      // gardes RF-PW-W02/W03
        ↓
ProfessionalShowcaseReadPort.findByUserId(userId)          // réutilisé pour la projection (6.3.3)
ProfessionalShowcaseWritePort                               // nouveau port local
        ↓
TypeOrmProfessionalShowcaseReader                           // 6.3.3
TypeOrmProfessionalShowcaseWriter                           // nouveau : transactions, version, catch 23505/23514
        ↓
pros.profiles/services/business_hours/locations + geo.divisions + pros.categories
```

### 5.1 Port d'écriture `ProfessionalShowcaseWritePort` (+ token)

Toutes les mutations reçoivent `expectedVersion` et **incrémentent `pros.profiles.version`**
dans la même transaction (RF-PW-W04b) ; retournent `null` si la version est obsolète (0 ligne
mise à jour) → le service lève 409 `version_conflict`. Chaque méthode exécute sa transaction
**complète** avant de retourner (l'événement est publié par le service, après succès).

| Méthode | Contrat |
|---|---|
| `updateProfile(userId, cmd: UpdateShowcaseCommand)` | UPDATE `pros.profiles` `WHERE user_id = $1 AND version = $n AND deleted_at IS NULL`, `version = version + 1` → **null si 0 ligne** (concurrence). Retourne le profile relu. |
| `createService(userId, cmd: ServiceCommand)` | Transaction : INSERT `pros.services` (uuid généré) ; si `is_primary` → UPDATE des autres services du pro à `false` (RF-PW-W06) ; bump `version`. |
| `updateService(userId, serviceId, cmd: ServiceCommand)` | Transaction : UPDATE `WHERE id = $1 AND professional_id = (SELECT id FROM pros.profiles WHERE user_id = $2 AND deleted_at IS NULL)` → **null si 0 ligne** → 404 `service_not_found` ; bascule `is_primary` idem (RF-PW-W06) ; bump `version`. |
| `deleteService(userId, serviceId)` | Transaction : DELETE logique (`deleted_at = now()`) — soft delete cohérent avec BaseEntity ; **null si 0 ligne** → 404. **Aucune promotion automatique** si le service supprimé était `is_primary` (RF-PW-W06b) ; bump `version`. |
| `replaceBusinessHours(userId, items: BusinessHourInput[], expectedVersion)` | **Transaction atomique (RF-PW-W08)** : DELETE `pros.business_hours` du pro puis INSERT (0-7) + bump `version` — soit tout, soit rien. |
| `upsertLocation(userId, cmd: LocationCommand)` | Transaction : INSERT `ON CONFLICT (professional_id) DO UPDATE` (ou vérification existence + INSERT/UPDATE) ; **conversion PostGIS dans l'adaptateur uniquement** (RF-PW-W09) : `location = ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)` ; bump `version`. |
| `categoryById(categoryId)` | ligne `pros.categories` (+ `parent_id`, `active`) pour validation W07 — 1 requête indexée. |
| `divisionExists(divisionId)` | existence `geo.divisions` (RF-PW-W09) — 1 requête indexée, appelée seulement si `division_id` fourni. |

**Exceptions DB → erreurs métier** (même pattern que `TypeOrmUserRepository.updateProfile`,
catch `driverError.code`) : `23505` (unicité) et `23514` (CHECK : prix, horaires) → 422/409
métier via le service ; les **validations sémantiques sont faites dans le service avant
l'écriture** (le catch n'est qu'un filet de sécurité).

### 5.2 Service `ProfessionalShowcaseService` (extension, gardes mutualisées)

- Gardes (mutualisées avec `getMe`, RF-PW-W02/W03) : view null → `UserNotFoundError` ;
  anonymisé → `AccountAnonymizedError` ; user SUSPENDED/BANNED → `AccountLockedError` ;
  rôle ≠ PROFESSIONAL ou fiche absente → `ProfessionalNotFoundError` ; fiche SUSPENDED →
  `AccountLockedError`. **Pas de garde PENDING_OTP** (le compte est ACTIVE pour écrire sa vitrine).
- `updateMe(actorId, cmd)` : gardes → `writePort.updateProfile` → `null` → `VersionConflictError`
  (409) → événement `pros.profile.updated` (payload : `professional_id`, `user_id`, `version`
  + champs modifiés) → projection complète via `readPort.findByUserId`.
- `createService/updateService/deleteService` : gardes → validation catégorie W07 (port) →
  écriture → `null` → `ServiceNotFoundError` (404) → événement → projection complète.
- `replaceBusinessHours(actorId, items)` : gardes → validation sémantique W08 (weekday 1-7
  uniques, close > open, ≤ 7 éléments) → `BusinessHoursInvalidError` (422) sinon écriture
  atomique → événement → projection complète.
- `upsertLocation(actorId, cmd)` : gardes → validation bornes lat/lon + rayon > 0 (400 via
  DTO) + `division_id` existant (port, sinon `DivisionNotFoundError` 404) → upsert →
  événement → projection complète.
- **L'événement n'est publié qu'après le succès complet de la mutation** (post-transaction,
  RF-PW-W11) ; aucune publication sur erreur/rollback.
- Toutes les projections de réponse passent par **un seul appel** `readPort.findByUserId`
  (une lecture, cohérence garantie).

### 5.3 Nouvelles erreurs (professionals-errors.ts, même shape que auth)

`ServiceNotFoundError` (404 `service_not_found`) · `CategoryNotFoundError` (404
`category_not_found`) · `CategoryNotAssignableError` (422 `category_not_assignable`) ·
`DivisionNotFoundError` (404 `division_not_found`) · `BusinessHoursInvalidError` (422
`business_hours_invalid`). Réutilisées d'auth : `UserNotFoundError`, `AccountLockedError`,
`AccountAnonymizedError`, `VersionConflictError` (même shape `{code, httpStatus}` → mappées
par `AuthExceptionsFilter` global, aucun filtre à ajouter).

### 5.4 DTO (professionals/interface/http/dto, ValidationPipe global)

`UpdateMeDto` (business_name 2-120 · headline ≤160 · description ≤2000 · experience_years
0-50 · employees_count 0-10000 · min_price ≥0 · website URL ≤255 · social_links objet
`{whatsapp?, facebook?, instagram?, tiktok?, linkedin?, website?}` ≤6 clés · version int ≥1) ·
`ServiceDto` (category_id uuid · title 2-160 · description ≤2000 · price_from ≥0 ·
price_to ≥0 + ≥ price_from (vérifié par le service/db) · price_unit enum CAT-006 ·
is_primary bool · sort_order ≥0 · version int ≥1) · `DeleteServiceDto` (version int ≥1) ·
`BusinessHoursDto` (`hours[]` max 7 · weekday 1-7 · open_at/close_at `HH:MM:SS` via regex ·
version int ≥1) · `LocationDto` (lat -90..90 · lon -180..180 · division_id uuid optionnel ·
service_radius_km 0.1..500 · address_text ≤500 · version int ≥1).

## 6. Tests

### Unitaires (extension `professional-showcase.service.spec.ts`)
- `updateMe` : succès (mapping + version+1, événement `pros.profile.updated` publié avec
  payload complet) ; 404 non-PRO ; 403 user SUSPENDED/BANNED ; 403 anonymisé ; 403 fiche
  SUSPENDED ; 409 stale (port → null) ; aucun événement sur échec.
- Services : create (insert + is_primary bascule les autres à false — port appelé avec le
  reset), update (404 `service_not_found` quand port → null), delete (soft, 404 si absent),
  **delete du primary → aucune promotion (W06b)**, 404 `category_not_found`,
  422 `category_not_assignable` (non-feuille / inactive).
- Business hours : jeu valide (7 lignes, closed true conservé), doublon weekday → 422,
  close ≤ open → 422, weekday hors 1-7 → 422, > 7 éléments → 422, ∅ → remplacement à vide.
- Location : upsert appelé avec les bonnes valeurs ; lat/lon hors bornes → rejet (port
  non appelé) ; `division_id` inconnu → 404 `division_not_found` (port non appelé pour
  l'upsert).
- Version : chaque mutation (fiche, service, hours, location) reçoit `expectedVersion` et
  `null` du port → 409 `version_conflict` ; événement jamais publié sur 409.
- Projection : après chaque écriture, réponse = fiche relue (même résultat que getMe).

### E2E (`test/professionals/me-write.e2e-spec.ts`, préfixe 660400)
W1 PUT fiche 200 (reflet GET : business_name/headline/description + version 2) · W2 401 sans
Bearer · W3 403 user SUSPENDED · W4 404 CLIENT logué · W5 409 version stale ·
W6 400 champ interdit (`status` dans le body) · W7 POST service 201 (reflet GET : service
présent, tri sort_order) · W8 POST 2ᵉ service primary → 1ᵉʳ passe `is_primary=false` ·
W9 PUT service 200 (prix modifiés) · W10 DELETE service 200 + absent ensuite ·
W10b DELETE du service principal → aucun autre promu (is_primary tous false) ·
W11 404 service inconnu · W12 catégorie inactive → 422 · W13 catégorie non-feuille → 422 ·
W14 PUT hours 200 (reflet : 7 lignes, closed conservé) + doublon → 422 + close ≤ open → 422 +
**atomicité : jeu invalide → aucun changement (reflet inchangé)** ·
W15 PUT location 200 (reflet : lat/lon 6 décimales via ST_Y/ST_X, division_name résolu) ·
W15b PUT location `division_id` inconnu → 404 · W16 PUT location sans division (address_text
seul) → location_name = address_text · W17 mutations services/hours/location avec version
obsolète → 409 (version globale vitrine).
Non-régression : P1-P8, M1-M8, U1-U8, G1-G5 rejoués.

## 7. Impact DB / migration

**Aucune migration** : `pros.profiles` (`version`), `pros.services` (CHECK prix),
`pros.business_hours` (PK + CHECK weekday/open), `pros.locations` (PK + GEOMETRY),
`pros.categories` (FK + `active`) existent en migration 001. Point écrit via
`ST_SetSRID(ST_MakePoint(lon, lat), 4326)` (colonne GEOMETRY(Point,4326) en 001 ;
lecture ST_Y/ST_X — cohérent 6.3.3). **Absents de 001 → hors périmètre** :
`pros.coverage_areas`/`geo.areas` (POST /coverage-areas), `pros.availability_slots` (FCT-022).

## 8. Décisions verrouillées (synthèse)

1. Réponses de mutation = **projection complète** (W10) — cohérent 6.3.2, jamais de 204.
2. Événement unique `pros.profile.updated` (10 MOD-03) pour toutes les mutations vitrine,
   **publié uniquement après succès complet** (jamais pendant une transaction, jamais sur
   rollback — W11) ; pas d'outbox transactionnel au MVP (D-EVT-1), reporté à un lot ultérieur.
3. `is_primary` unique géré **en application** (aucune contrainte DB dédiée) — même
   transaction que l'écriture du service (W06) ; **aucune promotion automatique** à la
   suppression du principal (W06b).
4. 404 `professional_not_found` identique lecture/écriture (RF-PW-W02).
5. **`pros.profiles.version` = version globale de la vitrine** pour **toutes** les mutations
   (W04b) — services, horaires et localisation inclus, incrément dans la même transaction.
6. Conversion PostGIS (`ST_MakePoint`) **uniquement dans l'adaptateur infrastructure** (W09).
7. `division_id` vérifié contre `geo.divisions` (404 `division_not_found`) (W09).
8. `coverage-areas` et `availability` reportés (tables manquantes) — sous-lots avec migration.
9. Rôle verrouillé : jamais de promotion/démotion de rôle ici (D5, 27).
