# Tests — Lot 6.3.1 : Profil `/GET /me` (cas Gherkin/xUnit)

> Livrable « Tests » de l'ordre **Alignement docs → Contrats API → Services métier → Tests → Implémentation**.
> **Aucune implémentation.** Sources : `30-spec-users-lot-6-3.md` (RF-ME-01…07, E-ME-01…07),
> `31-api-contracts-users.md` (contrats), `32-services-users-contracts.md` (services),
> `13-strategie-tests.md` (pyramide). Convention : GWT (Given/When/Then) pour E2E (supertest) ;
> tableaux de cas pour xUnit — framework Jest (déjà en place).

---

## 1. Mapping niveaux de test

| Niveau (13) | Focus 6.3.1 | Outil |
|---|---|---|
| 2. Unitaires | `ProfileService.getMe` (projection owner, statuts, RGPD), `AuthGuard` / `@CurrentUser()` | Jest (backend) |
| 3. Intégration | `UserRepositoryPort.findById` + rôle, mapping `pros.profiles` | testcontainers PG+PostGIS |
| 4. E2E | `GET /api/v1/me` (Bearer) | supertest + base isolée |

**Priorité couverture** : RGPD (anonymisé → 403), pas de fuite de données (`401` sur sub inconnu),
projection pro `professional` (rating_avg/trust_score), `SUSPENDED/BANNED` 403.

---

## 2. Cas unitaires — `ProfileService.getMe`

| Cas | Résultat attendu |
| user ACTIVE complet → `UserMe` total (id, cc, phone, email, full_name, avatar_url, locale, status, otp_verified_at, created_at, roles) | 200 bien formé |
| user ACTIVE + rôle PROFESSIONAL + `pros.profiles` existant | `professional` peuplé (id, business_name, status, verification_status, rating_avg…) |
| user ACTIVE + rôle PROFESSIONAL + profil pro **absent** | `professional = null` (pas d'exception) |
| user ACTIVE + rôle DELIVERER avec zone/moyens renseignés | `deliverer = { zone, means }` ; sinon `deliverer` null |
| user `PENDING_OTP` (inscription en cours) | profil restreint `{id, phone, country_code, status}` (E-ME-06) |
| user `SUSPENDED` | `AccountLockedError` |
| user `BANNED` | `AccountLockedError` |
| user `anonymized_at` posé | `AccountAnonymizedError` (403 `resource_unavailable`) |
| `findById` → null | `UserNotFoundError` (401) |
| mapping `pros.profiles` en erreur (base KO) | propager l'erreur (jamais de réponse partielle) |

### 2.1 `AuthGuard` (nouvel artefact)

| Cas | Résultat attendu |
|---|---|
| header `Authorization: Bearer <token valide>` | `request.currentUser = claims.sub` |
| header absent / non Bearer | 401 `unauthorized` |
| token expiré | 401 `token_expired` |
| token falsifié | 401 `unauthorized` |
| décorateur `@CurrentUser()` sur route sans garde | `undefined` (pas de crash) |

---

## 3. Cas d'intégration (testcontainers)

| Cas | Assertions |
|---|---|
| `findById(ACTIVE user)` renvoie l'entité pleine (flags auth, role, xor) | toutes colonnes lues |
| `findRolesById` renvoie [] si `user_roles` vide ; rôle unique si 1 ligne | le champ `roles.length` |
| `pros.profiles` créé au register PROFESSIONAL → retrouvé par `findByUserId` | `professional.status = PENDING_VERIFICATION` |
| RGPD : `anonymized_at` posé sur le user → `getMe` → 403 | pas d'accès aux champs |

---

## 4. Cas E2E (Gherkin — supertest)

### M — `GET /api/v1/me`

| # | Scénario | Attendu |
|---|---|---|
| M1-LOGIN | login CLIENT (tokens) puis GET /me avec access | 200 ; `id`, `full_name`, `phone`, `status=ACTIVE` ; champs pro absents |
| M2-PRO | user PROFESSIONAL actif (register + profil pros) `/me` | 200 + objet `professional` (status `PENDING_VERIFICATION`, rating_avg 0) |
| M3-AUTH | GET /me **sans** Bearer | 401 `unauthorized` |
| M4-TOKENEXP | access token expiré (mock clock) | 401 `token_expired` |
| M5-FALS | access token falsifié | 401 `unauthorized` |
| M6-SUSPEND | user SUSPENDED par admin puis /me | 403 `account_locked` |
| M7-RGPD | user avec `anonymized_at` | 403 `resource_unavailable` |
| M8-OWN2 | access valide d'un 2ᵉ user | `/me` retourne **ses** données, jamais celles d'un autre compte |

---

## 5. Table de couverture (spec → tests)

| Spec (30) | Cas | Couvert |
|---|---|---|
| §3.1 Auth (RF-ME-01/02) | 2.1 + M3/M4/M5 | ok |
| §3.1 État (RF-ME-03) | 2 + M6 | ok |
| §3.2 Contenu (RF-ME-04/05/06/07) | 2 + M1/M2/M7 | ok |
| §3.3 Erreurs (E-ME-01…07) | 2 + M3-M8 | ok |

---

## 6. Critères d'acceptation (avant implémentation)

- [ ] `ProfileService.getMe` : tous les cas xUnit verts (Jest), couverture du domaine ≥ 80 %.
- [ ] `AuthGuard` : 5 cas unitaires verts.
- [ ] E2E M1–M8 verts sur postgres-testcontainer.
- [ ] Assertion « /me (2 users) renvoie les données du **bon** user » présente.
- [ ] Aucune évolution du contrat 6.2 (rétro-compatibilité vérifiée par les suites auth toujours vertes).