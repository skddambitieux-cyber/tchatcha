# Cadrage contractuel — Sous-lot 6.3.2 : `PUT /api/v1/me` (modification du profil)

> Livrable de cadrage validé (bug.md) avant implémentation.
> Périmètre : écriture de l'identité du compte connecté (suite directe de 6.3.1 `GET /me`).
> Sources : `30-spec-users-lot-6-3.md` §1 « Toute écriture du profil relève d'un sous-lot
> 6.3.2+ », `12-api-blueprint.md` §1 (PUT = remplacement), `06-schema-base.md` §6
> (versionnement optimiste `version`), `10-blueprint-backend.md` (événement
> `users.profile.updated`). N'affecte ni le module professionals ni la RGPD.

---

## 1. Objectif et périmètre

- US-011 (07g) : le client complète / modifie son profil (nom, avatar).
- L'utilisateur connecté **remplace** les champs modifiables de son identité :
  `full_name`, `locale`, `email`, `avatar_url`.
- **Hors périmètre 6.3.2** (sous-lots suivants) : profil pro (`PUT /professionals/me`,
  6.3.4), RGPD (`DELETE /me`, export, 6.3.6), multi-rôles, `phone` / `country_code`
  (immutables, 27 §D5), consentements, `flags`.

## 2. Règles fonctionnelles

| ID | Règle |
|---|---|
| RF-ME-W01 | La requête exige `Authorization: Bearer <access_token>` ; `sub` = `user_id` (AuthGuard 6.3.1). |
| RF-ME-W02 | Seuls les champs `full_name`, `locale`, `email`, `avatar_url` sont modifiables ; tout autre champ du body → 400 (ValidationPipe global, `forbidNonWhitelisted`). |
| RF-ME-W03 | `phone`, `country_code`, `status`, `roles`, `professional`, `deliverer`, `flags` ne sont jamais acceptés (rôle verrouillé D5, 27). |
| RF-ME-W04 | Le body porte `version` (dernier numéro lu via GET /me) : verrouillage optimiste (06 §6). |
| RF-ME-W05 | `email` : optionnel, nullable, format email, ≤ 255 ; **unicité** : s'il est déjà porté par un autre compte → **409 `email_already_registered` (uniquement)**. |
| RF-ME-W06 | `locale` : pattern `[a-z]{2}` (fr, en…) ; `avatar_url` : optionnel, nullable, ≤ 2048, URL. |
| RF-ME-W07 | Compte `BANNED`/`SUSPENDED` → 403 `account_locked` ; `anonymized_at` posé → 403 `resource_unavailable` (RGPD, incoercible) ; `PENDING_OTP` → 409 `state_conflict` (profil non complet). |
| RF-ME-W08 | Succès → 200 `MeResponse` (projection complète 6.3.1, `version` incluse) ; l'écriture est journalisée par événement `users.profile.updated`. |

## 3. Contrat API

```http
PUT /api/v1/me
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "full_name": "Kossi Agbo",
  "locale": "fr",
  "email": "kossi@example.com",     // optionnel, nullable (null = effacer)
  "avatar_url": "https://cdn…/a.png", // optionnel, nullable
  "version": 3                        // requis (lu via GET /me)
}
```

**Réponses**

| Code | Corps | Quand |
|---|---|---|
| 200 | `MeResponse` (31 §1, champ `version` ajouté — 12 §2, mineur) | succès |
| 400 | `statusCode/message` (pipe global) | champ interdit ou invalide |
| 401 | `unauthorized` | Bearer absent/malformé/sub inconnu |
| 401 | `token_expired` | access expiré |
| 403 | `account_locked` | SUSPENDED/BANNED |
| 403 | `resource_unavailable` | anonymisé |
| 409 | `email_already_registered` | email déjà porté par un autre compte |
| 409 | `version_conflict` | version du body ≠ version en base (concurrence) |
| 409 | `state_conflict` | compte PENDING_OTP |

> Note : la validation de forme reste le 400 NestJS (cohérent avec G5-BADFIELD de la
> suite 6.2) ; les 409 répondent à la consigne bug.md « une seule réponse pour l'email
> dupliqué » et au référentiel 12 §5 (409 = conflit d'état).

## 4. Contrat de service (`32-services-users-contracts.md` à étendre)

| Type | Détail |
|---|---|
| `UpdateProfileCommand` | `{ fullName, locale, email|null, avatarUrl|null, expectedVersion }` |
| `UserRepositoryPort.updateProfile(userId, input)` | `Promise<User \| null>` — UPDATE `WHERE id AND version = $n AND deleted_at IS NULL` ; `version = version + 1` ; **null si 0 ligne** (concurrence) ; violation `uq_users_email` (23505) → `EmailAlreadyRegisteredError` |
| `ProfileService.updateMe(actorId, input)` | gardes 6.3.1 (not-found/anonymized/locked) + `PENDING_OTP` → `state_conflict` ; `null` du port → `VersionConflictError` ; publie `users.profile.updated` (D-EVT-1, émission synchrone MVP) puis retourne la projection complète |
| Événement | `users.profile.updated` : `{ user_id, full_name, locale, email, avatar_url, version }` |

**Nouvelles erreurs (auth-errors.ts)** : `EmailAlreadyRegisteredError` (409 `email_already_registered`),
`VersionConflictError` (409 `version_conflict`), `PendingOtpWriteError` (409 `state_conflict`).

## 5. Tests

### Unitaires (extension `profile.service.spec.ts` §3)
Succès (mapping complet + version), email null / avatar null (effacement), email non fourni,
401 sub inconnu, 403 SUSPENDED, 403 BANNED, 403 anonymisé, 409 stale (port → null),
409 email dupliqué (port lève), 409 PENDING_OTP, événement publié (payload version+1),
aucun événement sur échec.

### E2E (`test/me/me-update.e2e-spec.ts`, suite 6.3.1 étendue)
U1 200 (PUT puis GET reflet : nom/locale/email/avatar + version incrémentée) · U2 401 sans
Bearer · U3 403 SUSPENDED · U4 403 anonymisé · U5 409 email dupliqué (2ᵉ compte) ·
U6 409 version stale (version-1) · U7 400 champ interdit (`phone` dans le body) ·
U8 400 email malformé. Non-régression : M1-M8 et G1-G5 rejoués.

## 6. Impact DB

**Aucune migration** : `users.users` possède déjà `version int NOT NULL DEFAULT 1`
(migration 001) et `uq_users_email` (partiel, 06a §2). Lecture seule des autres tables.