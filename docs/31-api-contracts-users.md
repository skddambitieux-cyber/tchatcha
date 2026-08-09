# Contrats API — Lot 6.3.1 : Profil — `GET /me`

> Livrable « Contrats API » de l'ordre **Alignement docs → Contrats API → Services métier → Tests → Implémentation**.
> **Aucune implémentation.** Source : `30-spec-users-lot-6-3.md` (règles RF-ME-01…07, erreurs E-ME-01…07),
> `12-api-blueprint.md` (enveloppe d'erreur §5, RBAC §4), `27-api-contracts-auth.md` (héritage JWT `Authorization: Bearer`, codes 401).
> Version : v1. Base URL : `/api/v1`. JSON UTF-8. Dates ISO 8601 UTC.

## 0. Conventions reprises du blueprint/auth

- Authentification : `Authorization: Bearer <access_token>` (JWT, 15 min, `sub` = `user_id`).
  Identique à `27-api-contracts-auth.md` (§7-8), garde réutilisée.
- Enveloppe d'erreur unique (12 §5) :
  ```
  { "error": { "code": "<machine_code>", "message": "<localisé>",
               "details": [], "trace_id": "…", "request_id": "…" } }
  ```
- **Pas de fuite** : aucune erreur n'énumère l'existence/état (401 générique pour token invalide/inconnu).
- Codes hérités du module auth : `unauthorized`, `token_expired` (401) — réutilisés ici.

---

## 1. DTO de sortie — `MeResponse` (V1)

| Champ | Type | Source | Note |
|---|---|---|---|
| `id` | uuid | `users.users.id` | |
| `country_code` | string(2) | `users.users.country_code` | « BJ » |
| `phone` | string(15) | `users.users.phone` | E.164 sans + |
| `email` | string \| null | `users.users.email` | null si absent/anonymisé |
| `full_name` | string | `users.users.full_name` | |
| `avatar_url` | string \| null | | S3 URL publique |
| `locale` | string | `users.users.locale` | défaut `fr` |
| `status` | `ACTIVE \| SUSPENDED \| BANNED \| PENDING_OTP` | `users.users.status` | |
| `otp_verified_at` | datetime \| null | | |
| `created_at` | datetime | `users.users.created_at` | |
| `roles` | `string[]` | `users.user_roles.role` | MVP : 1 élément |
| `professional` | `MeProfessional \| null` | `pros.profiles` | **seulement** si rôle PROFESSIONAL + profil existant |
| `deliverer` | `object \| null` | flags/rôle DELIVERER | MVP : à vide si non renseigné |

### `MeProfessional`

| Champ | Type | Source |
|---|---|---|
| `id` | uuid | `pros.profiles.id` |
| `business_name` | string \| null | `pros.profiles.business_name` |
| `status` | `DRAFT \| PENDING_VERIFICATION \| ACTIVE \| SUSPENDED` | `pros.profiles.status` |
| `verification_status` | string | dérivé (`verified` booléen, lot 6.3.4 vérification) |
| `rating_avg` | number | `pros.profiles.rating_avg` (0-5) |
| `rating_count` | int | `pros.profiles.rating_count` |
| `trust_score` | number | `pros.profiles.trust_score` |
| `completed_jobs` | int | `pros.profiles.completed_jobs` |
| `location_name` | string \| null | `geo.divisions.name` via `pros.locations` (repli `address_text`) | MVP — pas de colonne `label` dans `pros.locations` |

---

## 2. GET /me — lire son profil

**Objectif** : renvoyer le profil du compte connecté (source d'authenticité = token).

**Requête**
```http
GET /api/v1/me
Authorization: Bearer <access_token>
```

**Réponses**
| Code | Corps | Notes |
|---|---|---|
| 200 | `MeResponse` | profil « complet » (champs §1) ; si `PENDING_OTP` → profil « en création » (id, phone, country_code, status uniquement) |
| 401 | `unauthorized` | token absent/malformé/sub inconnu |
| 401 | `token_expired` | access expiré (> 15 min) |
| 403 | `account_locked` | compte SUSPENDED / BANNED (message générique) |
| 403 | `resource_unavailable` | compte anonymisé (RGPD, `anonymized_at` posé) |

---

## 3. Table des erreurs (ajout au référentiel 27)

| HTTP | `code` | Quand | Détails |
|---|---|---|---|
| 200 | — | succès | — |
| 401 | `unauthorized` | Bearer absent/malformé/token invalide/sub inconnu | — |
| 401 | `token_expired` | access JWT expiré | — |
| 403 | `account_locked` | compte SUSPENDED/BANNED | — |
| 403 | `resource_unavailable` | compte anonymisé (RGPD) | — |

---

## 4. Ordre d'implémentation (rappel)

1. **API** : ce document (contrats figés).
2. **Services métier** : `ProfileService.getMe` (contrat → `32-services-users-contracts.md`).
3. **Tests** : cas GWT/xUnit dérivés de `30-spec-users-lot-6-3.md` §3 (→ `33-tests-users.md`).
4. **Implémentation** : garde `AuthGuard`, décorateur `@CurrentUser()`, contrôleur nouveau
   `UsersController` ou extension `AuthController`, sans déviation des contrats.

> Règle : toute déviation (champ, code HTTP) = mise à jour de ce doc (+ spec) avant code.