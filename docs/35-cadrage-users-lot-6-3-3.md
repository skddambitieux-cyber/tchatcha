# Cadrage contractuel — Sous-lot 6.3.3 : `GET /api/v1/professionals/me` (vitrine pro, lecture seule)

> Livrable de cadrage validé (bug.md) avant implémentation.
> Périmètre : lecture de la **vitrine professionnelle du propriétaire authentifié**
> (US-091 « voir ma vitrine telle que vue »), suite directe de 6.3.1/6.3.2.
> Sources : `12-api-blueprint.md` L209 (FCT-021/022 : `GET /professionals/me`),
> `10-blueprint-backend.md` MOD-03 (vitrine, services, portfolio, réputation),
> `32-services-users-contracts.md` D-ME-3 (réutilisation AuthGuard), `06a §4`
> (tables pros), `06b §8` (media.files polymorphe), `06d §2` (réputation).
> Aucune écriture, aucun upload, aucune vérification, aucun RGPD dans ce sous-lot.

---

## 1. Objectif et périmètre

- Le professionnel connecté lit **sa** fiche vitrine complète : identité commerciale,
  catégorie de service, localisation, services, horaires, portfolio, réputation, badge.
- **Hors périmètre 6.3.3** (sous-lots suivants, pas d'écriture ici) :
  `PUT /professionals/me` + CRUD `/services`/`/business_hours`/`/location` (6.3.4),
  portfolio upload presigné R2 (6.3.5), vérifications CIN (6.3.5), RGPD (6.3.6),
  fiche publique `GET /professionals/:id` (FCT-007, lot ultérieur).

## 2. Règles fonctionnelles (verrouillées — bug.md)

| ID | Règle |
|---|---|
| RF-PW01 | Requête `Authorization: Bearer <access_token>` (AuthGuard 6.3.1 exporté par AuthModule, D-ME-3) ; `sub` = `user_id`. |
| RF-PW02 | **404 `professional_not_found`** pour tout utilisateur authentifié dont le rôle ≠ `PROFESSIONAL` (ou dont `pros.profiles` n'existe pas). Règle de non-dévoilement : une vitrine pro n'est pas reconnue si elle n'existe pas. **Comportement contractuel testé.** |
| RF-PW03 | Compte `BANNED`/`SUSPENDED` (users) ou fiche `SUSPENDED` → 403 `account_locked`. Compte `anonymized_at` posé → 403 `resource_unavailable` (RGPD). |
| RF-PW04 | **location_name** (verrouillé) : `geo.divisions.name` si `pros.locations.division_id` résout, **sinon** `pros.locations.address_text`, sinon `null`. Aucune autre source. Même règle que 6.3.1 (31 §1) — pas de divergence adaptateur/tests. |
| RF-PW05 | **portfolio** (verrouillé) : renvoie **exclusivement** les `media.files` de `owner_type = 'PROFESSIONAL'` avec `purpose ∈ {PORTFOLIO, BEFORE_AFTER}` et `status = READY`, triés par `sort_order` puis `created_at`. Aucun fichier privé/administratif (VERIFICATION, DOCUMENT, INVOICE, AVATAR…) n'est jamais exposé ici. |
| RF-PW06 | **Fiche minimale** (utilisateur PRO sans aucun extra) : `location`, `reputation`, `portfolio` → `null` ; `services`, `business_hours` → `[]`. Jamais d'erreur ni de champ absent. |
| RF-PW07 | **Point géographique** (politique de lecture) : `lat`/`lon` (deg, 6 décimales) exposés **au propriétaire uniquement** (lecture `/me`). La fiche publique FCT-007 définira sa propre politique. `division_name`/`location_name` toujours via RF-PW04. |
| RF-PW08 | Lecture pure : **aucun événement publié**, aucune écriture (même règle que GET /me). `rating_avg`/`rating_count`/`completed_jobs`/`trust_score` lus depuis `pros.profiles` (agrégats, 06a) ; détails de réputation depuis `pros.reputation` si présente. |
| RF-PW09 | Perf (bug.md) : **2 à 4 requêtes indexées max**, pas de jointure géante : ① profil + location + reputation (joins 1:1) ; ② services + catégorie ; ③ business_hours ; ④ portfolio (si non absorbé). |

## 3. Contrat API

```http
GET /api/v1/professionals/me
Authorization: Bearer <access_token>
```

**Réponses**

| Code | Corps | Quand |
|---|---|---|
| 200 | `ProfessionalMeResponse` (§4) | fiche du propriétaire |
| 401 | `unauthorized` / `token_expired` | Bearer absent/malformé/expiré/sub inconnu |
| 403 | `account_locked` | user BANNED/SUSPENDED ou fiche SUSPENDED |
| 403 | `resource_unavailable` | compte anonymisé |
| 404 | `professional_not_found` | rôle ≠ PROFESSIONAL ou fiche absente (RF-PW02) |

## 4. `ProfessionalMeResponse`

| Champ | Type | Source |
|---|---|---|
| `id` | uuid | `pros.profiles.id` |
| `user_id` | uuid | `pros.profiles.user_id` |
| `version` | int | `pros.profiles.version` |
| `business_name` | string \| null | |
| `headline` | string \| null | |
| `description` | string \| null | |
| `experience_years` | int \| null | |
| `employees_count` | int \| null | |
| `status` | `DRAFT\|PENDING_VERIFICATION\|ACTIVE\|SUSPENDED` | |
| `verified` | boolean | badge (ADR-008) |
| `verified_at` | datetime \| null | |
| `rating_avg` | number | `pros.profiles` (0-5) |
| `rating_count` | int | |
| `completed_jobs` | int | |
| `min_price` | number \| null | |
| `currency` | char(3) | |
| `website` | string \| null | |
| `social_links` | object \| null | |
| `location` | `ProfessionalLocation \| null` | §4.1 |
| `services` | `ServiceItem[]` | §4.2 |
| `business_hours` | `BusinessHourItem[]` | §4.3 |
| `portfolio` | `PortfolioItem[]` | §4.4 |
| `reputation` | `ReputationView \| null` | §4.5 |

### 4.1 `ProfessionalLocation` (pros.locations + geo.divisions)
`{ country_code, division_id, division_name, location_name, lat, lon, service_radius_km, address_text }`

### 4.2 `ServiceItem` (pros.services + pros.categories)
`{ id, category_id, category_name, slug, title, description, price_from, price_to, price_unit, is_primary, sort_order }`
— tri `sort_order ASC` puis `created_at ASC`.

### 4.3 `BusinessHourItem` (pros.business_hours)
`{ weekday, open_at, close_at, closed }` — tri `weekday ASC`.

### 4.4 `PortfolioItem` (media.files, **purpose verrouillé RF-PW05**)
`{ id, url, media_type, purpose, width, height, sort_order }` — tri `sort_order ASC`, prêt affichage (READY).

### 4.5 `ReputationView` (pros.reputation, nullable)
`{ trust_score, trust_level, verification_level, completed_jobs, acceptance_rate, cancellation_rate, avg_response_min, punctuality_avg, avg_execution_days, disputes_count, seniority_days, ai_factor, recomputed_at }`

## 5. Contrat de service

```
ProfessionalsController (GET /professionals/me, @UseGuards(AuthGuard), @CurrentUser())
        ↓
ProfessionalShowcaseService.getMe(userId)           // guards RF-PW02/03, mapping
        ↓
ProfessionalShowcaseReadPort.findByUserId(userId)   // port local du module professionals
        ↓
TypeOrmProfessionalShowcaseReader                   // adaptateur SQL + entités pros/media/geo
```

- Port local : `ProfessionalShowcaseView` (agrégat : profile + location + reputation),
  `ServiceItem[]`, `BusinessHourItem[]`, `PortfolioItem[]` — l'adaptateur ne dépend que du port.
- Service : vérifie rôle `PROFESSIONAL` (via son propre repository users ou le view retourné avec
  `user_id` + rôle), applique 404/403, assemble la réponse (même ordre que 6.3.1 pour les 401/403).
- Nouvelles erreurs (module professionals, même shape que auth) : `ProfessionalNotFoundError`
  (404 `professional_not_found`). Réutilise `AccountLockedError`/`AccountAnonymizedError` (auth).

## 6. Tests

### Unitaires (service)
Fiche complète (toutes sections peuplées) ; fiche minimale (location/reputation/portfolio null,
services/hours []) ; location_name = division_name sinon address_text sinon null ;
portfolio filtré par purpose+READY ; 404 non-PRO ; 404 rôle PRO sans fiche ; 403 SUSPENDED/BANNED
(user et fiche) ; 403 anonymisé ; aucun événement publié ; lat/lon 6 décimales.

### E2E (`test/professionals/me.e2e-spec.ts`)
P1 PRO complet 200 (toutes sections + badge) · P2 PRO minimal 200 (lists vides, nulls) ·
P3 401 sans Bearer · P4 user SUSPENDED 403 `account_locked` · P5 anonymisé 403
`resource_unavailable` · P6 CLIENT logué → **404 `professional_not_found`** (RF-PW02) ·
P7 fiche SUSPENDED → 403 + portfolio filtré (purpose hors liste exclu).
Non-régression : M1-M8, U1-U8, G1-G5 rejoués.

## 7. Impact DB / migration

**Aucune migration** : toutes les tables/colonnes existent en migration 001/002
(pros.profiles/services/locations/business_hours/categories/reputation, media.files, geo.divisions).
Le point `geography(Point,4326)` est lu via `ST_Y/ST_X` (politique RF-PW07).

## 8. Correction découpage futur (bug.md)

**6.3.6** : `GET /professionals/me/reputation` (FCT-024) = endpoint **propriétaire** (via `/me`),
jamais public. La projection publique de réputation (et de fiche) relève du **FCT-007**
`GET /professionals/:id` (lot ultérieur, politique d'exposition distincte — pas d'ambiguïté de sécurité.