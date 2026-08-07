# Contrats API — Lot 6.2 : Authentification

> Livrable « Contrats API » de l'ordre **Alignement docs → Contrats API → Services métier → Tests → Implémentation**.
> **Aucune implémentation.** Source : `26-spec-auth-lot-6-2.md` (décisions D1–D5, état DÉCISIONS FINALES),
> `12-api-blueprint.md` (enveloppe d'erreur §5, rate limiting §6, principes §1), `10-blueprint-backend.md`.
> Version : v1. Base URL : `/api/v1`. JSON UTF-8. Dates ISO 8601 UTC.

## 0. Conventions reprises du blueprint

- Enveloppe d'erreur unique (§5) :
  ```
  { "error": { "code": "<machine_code>", "message": "<localisé>",
               "details": [ { "field": "…", "reason": "…", "meta": {} } ],
               "trace_id": "…", "request_id": "…" } }
  ```
- Le 423 (compte/slot verrouillé) du blueprint = **`account_locked`** ; pour l'auth nous ajoutons
  des codes spécifiques documentés ci-dessous (`phone_locked`, `otp_exhausted`…). Statut `423 Locked`.
- Rate limiting OTP (niveau « OTP », `12 §6`) appliqué par **numéro (country_code+phone)** :
  envoi 1 req/45 s, max 5 envois/15 min → `phone_locked` 15 min ; vérification **3 essais/code** → `otp_exhausted`.
- `Retry-After` (secondes) présent sur 429 et 423.
- **Pas de fuite d'existence** : une réponse ne révèle l'existence d'un numéro que là où le flux
  l'exige (ex. `409 phone_already_registered` à l'inscription) ; ailleurs, messages génériques (§3-4).

---

## 1. DTO et types partagés

| Type | Définition |
|---|---|
| `Phone` | `{ country_code: string(2) — ISO A-2, ex "BJ" ; phone: string(8–15 digits, sans + ni espace) }` normalisé E.164 |
| `OtpPurpose` | `REGISTER \| LOGIN \| RESET_PASSWORD \| PAYMENT` (enum existant) |
| `UserRole` | `CLIENT \| PROFESSIONAL \| DELIVERER` (plus ADMIN, réservé) |
| `DeviceInfo` | `{ device_id?: string(≤64) , ip?: string, user_agent?: string }` |
| `Consents` | `{ cgv: boolean, privacy: boolean, marketing?: boolean }` |
| `AuthTokens` | `{ access_token: string (JWT, 15 min), token_type: "Bearer", expires_in: 900, refresh_token: string (opaque, 30 j) }` |
| `UserPublic` | `{ id: uuid, role: UserRole, full_name: string, phone: string, status: "ACTIVE\|…" }` |

### Structurer les corps de requête

Nommage DTO (aligné `10-blueprint-backend`) :

| DTO | Champs |
|---|---|
| `RequestOtpDto` | `country_code, phone, purpose, device?` |
| `VerifyOtpDto` | `country_code, phone, code, purpose, device?` |
| `ResendOtpDto` | `country_code, phone, purpose` |
| `RegisterDto` | `country_code, phone, full_name, role, consents, category_id?, division_id?, locality_id?, delivery_zone?, device?` |
| `LoginDto` | `country_code, phone, code, device?` |
| `RefreshDto` | `refresh_token: string` |
| `LogoutDto` | `refresh_token: string` |

---

## 2. POST /auth/otp/request — demander un OTP

**Objectif** : émettre un code à 6 chiffres (TTL 5 min, usage unique) pour `REGISTER` ou `LOGIN`.
Crée le compte `PENDING_OTP` si `REGISTER` (D3). Idempotence : cooldown 45 s sur le numéro.

**Requête**
```http
POST /api/v1/auth/otp/request
Content-Type: application/json

{ "country_code": "BJ", "phone": "0198000011", "purpose": "REGISTER", "device": { "session_id": "dev-abc" } }
```
`purpose` : `REGISTER` (le numéro ne doit pas exister activement), `LOGIN` (le compte doit exister).
`LOGIN` avec un numéro PENDING_OTP/inconnu → identique à `REGISTER` (pas de fuite d'existence) mais
l'utilisateur verra un profil à compléter après vérif (cf. FCT-001/002).

**Réponses**
| Code | Corps | Notes |
|---|---|---|
| 202 | `{ "message": "otp_sent", "retry_after": 45, "expires_at": "2026-08-07T08:05:00Z" }` | OTP **jamais** dans la réponse (sauf driver console en dev). `expires_at = now+300s` |
| 401 | — | (non pertinent ici) |
| 422 | `validation_failed` | téléphone malformé, purpose invalide |
| 409 | `phone_already_registered` | `REGISTER` et compte `ACTIVE`/`SUSPENDED` déjà présent |
| 429 | `otp_cooldown` | cooldown 45 s non écoulé ; `Retry-After: 45` (secondes restantes) |
| 423 | `phone_locked` | 5 envois/15 min dépassés ; `Retry-After` (secondes restantes) |
| 503 | `provider_unavailable` | échec fournisseur SMS après retry interne 2× |

---

## 3. POST /auth/otp/verify — vérifier l'OTP

**Objectif** : valider le code et, selon `purpose`, **valider la vérification** (REGISTER → passage possible vers création) ou **délivrer la session** (LOGIN — cf. `4. POST /auth/login`… nous conservons `otp/verify` pour la validation seule et `auth/login` est un **alias** sémantique renvoyant vers verify+issue, voir §4).

> Décision de contrat : `otp/verify` vérifie et **marque `otp_verified_at`** mais **ne délivre pas de token**
> pour `REGISTER` (le profil reste à créer). Pour `LOGIN`, il **délivre les tokens** (session créée).
> Ceci évite deux chemins de délivrance concurrents et garde le flux lisible.

**Requête**
```http
POST /api/v1/auth/otp/verify
Authorization: Bearer <optional>
{ "country_code": "BJ", "phone": "0198000011", "code": "483920", "purpose": "REGISTER", "device": { "session_id": "dev-abc" } }
```

**Réponses**
| Code | Corps | Notes |
|---|---|---|
| 200 | `REGISTER` → `{ "status": "otp_verified" }` + (LOGIN) → `{ ...AuthTokens, "user": UserPublic }` | `used_at` posé, usage unique |
| 401 | `otp_invalid` + `details[0] = {field:"code", reason:"wrong_code", meta:{attempts_left:2}}` | essais restants |
| 410 | `otp_expired` | > 5 min ; renvoi requis |
| 409 | `otp_already_used` | code déjà validé (`used_at` non nul) |
| 423 | `otp_exhausted` | 3e échec du code ; invalidation, renvoi requis |
| 423 | `phone_locked` | canal verrouillé (5 envois dépassés) + `Retry-After` |
| 404 | `phone_not_found` | aucun OTP actif émis pour ce numéro/purpose (réponse générique, pas de fuite d'existence) |

---

## 4. POST /auth/login — connexion (téléphone + OTP)

**Décision** : `login` = alias découpage de `otp/verify`(LOGIN). Body = `{country_code, phone, code, device?}`.
Réponse identique au passage LOGIN de §3 (tokens + user). Cas : compte `ACTIVE` uniquement ;
`SUSPENDED`/`BANNED` → **403 `account_locked`** « compte suspendu » (message générique, pas d'énumération).
Codes d'erreur : mêmes que §3 + `account_locked`.

---

## 5. POST /auth/register — création du compte (après OTP vérifié)

**Objectif** : finalise une inscription `REGISTER` : complète le profil, applique les règles par rôle (D5),
passe `PENDING_OTP → ACTIVE`, pose `otp_verified_at`, émet les tokens (première session).

**Conditions préalables** : OTP `REGISTER` validé et non expiré, compte `PENDING_OTP` existant.
Si l'appel est répété avec le même body, on retombe sur le même état — `Idempotency-Key` recommandé.

**Requête**
```http
POST /api/v1/auth/register
Content-Type: application/json
Idempotency-Key: 6e7b3f3e-…   (optionnel)

{
  "country_code": "BJ", "phone": "0198000011",
  "full_name": "Aïcha Sossou", "role": "CLIENT",
  "consent": { "cgv": true, "privacy": true },
  "device": { "session_id": "dev-abc" }
}
```
Pour `PROFESSIONAL` : `+ "category_id": "uuid", "locality_id": "uuid", "division_id": "uuid"`.
Pour `DELIVERER` : `+ "delivery_zone": "COTONOU"`.

**Règles par rôle (D5)** :
| Rôle | Requis | Statut | Note |
|---|---|---|---|
| CLIENT | `full_name`, `consent.cgv` | ACTIVE | |
| PROFESSIONAL | + `category_id`, `division_id`, `locality_id` | ACTIVE (avec `verification_status=UNVERIFIED`) | création permise avant vérification CIN |
| DELIVERER | + `delivery_zone`, `delivery_means` | ACTIVE (`UNVERIFIED`) | |

**Réponses**
| Code | Corps | Notes |
|---|---|---|
| 201 | `{ ...AuthTokens, user: UserPublic }` + header `Location: /api/v1/me` | `UserPublic.status="ACTIVE"`, `otp_verified_at` positionné |
| 422 | `validation_failed` | `details` par champ : `full_name`, `role`, `consent.cgv`, `category_id`, `locality_id`, `delivery_zone` |
| 403 | `otp_not_verified` | OTP REGISTER non validé (ou expiré) |
| 409 | `phone_already_registered` | compte déjà ACTIVE sur ce numéro |
| 409 | `state_conflict` | rôle incompatible avec un compte PENDING_OTP existant (numéro déjà engagé) |

---

## 6. POST /auth/refresh — rotation du refresh token (D4)

**Requête**
```http
POST /api/v1/auth/refresh
Content-Type: application/json
{ "refresh_token": "<opaque>" }
```

**Réponses**
| Code | Corps | Notes |
|---|---|---|
| 200 | `{ ...AuthTokens }` | rotation : ancien invalidé via `replaced_by` |
| 401 | `refresh_expired` | > 30 j |
| 401 | `refresh_reused` | token déjà remplacé → **famille révoquée** (rejeu) + événement |
| 401 | `unauthorized` | token inconnu/corrompu |
| 401 | `invalid_device` | `device_id` ne correspond pas à la session (métaclasse) |

---

## 7. POST /auth/logout — révocation ciblée (RF-LOG)

**Requête**
```http
POST /api/v1/auth/logout
Authorization: Bearer <access_token>
Content-Type: application/json
{ "refresh_token": "<opaque>" }
```

**Réponses**
| Code | Corps |
|---|---|
| 204 | (vide) — `revoked_at` posé ; idempotent (2ᵉ appel → 204 toujours) |
| 401 | `unauthorized`, `token_expired` (access invalide) |

---

## 8. POST /auth/logout-all — révocation de toutes les sessions (appareil perdu)

**Requête**
```http
POST /api/v1/auth/logout-all
Authorization: Bearer <access_token>
```
**Réponses** : `204` (toutes les sessions de l'utilisateur révoquées) · `401`.

---

## 9. Table des codes d'erreur auth (enveloppe §5 du blueprint)

| HTTP | `code` | Quand | Champs `details` |
|---|---|---|---|
| 400 | `malformed_json` / `invalid_query` | JSON invalide, purpose hors enum | — |
| 401 | `unauthorized` | access token manquant/invalide | — |
| 401 | `token_expired` | access token expiré (15 min) | — |
| 401 | `otp_invalid` | code erroné | `field:code, reason:wrong_code, meta:{attempts_left}` |
| 401 | `refresh_reused` | rejeu de refresh (famille révoquée) | — |
| 401 | `refresh_expired` | refresh > 30 j | — |
| 403 | `otp_not_verified` | register sans OTP REGISTERED vérifié | — |
| 403 | `account_locked` | compte SUSPENDED/BANNED (login/refresh refuser) | — |
| 404 | `phone_not_found` | aucune demande OTP pour ce numéro (générique) | — |
| 409 | `phone_already_registered` | numéro déjà ACTIVE | — |
| 409 | `otp_already_used` | code déjà utilisé | — |
| 409 | `state_conflict` | rôle/état incompatible | — |
| 410 | `otp_expired` | code > 5 min | — |
| 422 | `validation_failed` | champ invalide | `field, reason` (voir §5) Type* |
| 422 | `consent_required` | `cgv` absent | `field:consent.cgv, reason:required` |
| 423 | `phone_locked` | 5 envois/15min (envoi) | `Retry-After` |
| 423 | `otp_exhausted` | 3 essais épuisés sur un code | — |
| 429 | `otp_cooldown` | cooldown 45 s (envoi) | `Retry-After: 45` |
| 429 | `rate_limited` | excès IP/compte | `Retry-After` |
| 500 | `internal_error` | erreur serveur | — |
| 503 | `provider_unavailable` | SMS indisponible | — |

---

## 10. Contrats → ordre d'implémentation (rappel)

1. **API** : ce document (contrats figés).
2. **Services métier** : `OtpService`, `TokenService`, `SessionService`, `ProfileService` (contrats
   d'interface du module `auth` — à spécifier au livrable suivant).
3. **Tests** : cas Gherkin/xUnit dérivés de `26-spec-auth-lot-6-2.md` §3–§8 (à rédiger ensuite).
4. **Implémentation** : controllers + use-cases + adapters (SMS), sans dévier des contrats.

> Règle : tout déviation au contrat (durée, code HTTP, champ) = mise à jour de ce doc (+ spec) avant code.