# Spécification fonctionnelle — Lot 6.3 : Profil utilisateur (sous-lot 6.3.1 — `GET /me`)

> Livrable de cadrage, **aucune implémentation** dans ce document.
> Périmètre : premier sous-lot du lot 6.3 « Users & Pros » (05-roadmap-technique §6.3) :
> la lecture du **profil du compte connecté** via `GET /api/v1/me`.
> Sources : `06a-tables-mvp-core.md` (`users.users`, `users.user_roles`, `pros.profiles`),
> `08-specification-fonctionnelle.md` (FCT-026, US-015), `10-blueprint-backend.md`,
> `12-api-blueprint.md` (PRINCIPES §1, erreurs §5, RBAC §4), `15-securite.md` (RGPD EM-001…EM-006),
> contrat hérité : `27-api-contracts-auth.md` §5 (register renvoie `Location: /api/v1/me`).
> Dépend du lot 6.2 (auth) : l'appelant est authentifié par **JWT access token** (Bearer), statuts `ACTIVE`.

---

## 1. Objectif et périmètre

- Besoin « consulter mon profil » (complète `US-6.2-04` de l'inscription ; couvre le besoin
  produit « voir mon compte ») : l'utilisateur connecté reçoit les **données de son compte**
  (identité, statut, rôle actif, consentements actifs, éléments métier liés au rôle —
  vitrine pro si `PROFESSIONAL`).
- **FCT-026 (US-015, RGPD)** : toute donnée personnelle est renvoyée **à son propriétaire uniquement**.
- Hors périmètre 6.3.1 (lots ultérieurs) : `PUT /me` (modification), `DELETE /me` (RGPD suppression),
  `GET /me/export`, avatar upload (S3), multi-rôles (user_roles multiples), notifications/settings.

Le sous-lot livre **une seule opération de lecture** : `GET /api/v1/me` (sans paramètre).
Toute écriture du profil relève d'un sous-lot 6.3.2+ ultérieur.

---

## 2. User Stories

| ID | En tant que… | je souhaite… | afin de… | Priorité |
|---|---|---|---|---|
| US-6.3.1-01 | utilisateur connecté | consulter mon profil (identité + statut + rôle) | voir et afficher mon compte | P0 |
| US-6.3.1-02 | utilisateur connecté | récupérer mon profil pro si `PROFESSIONAL` | alimenter l'écran « mon activité » | P1 |
| US-6.3.1-03 | client/pro/livreur | savoir si mon numéro est vérifié et quand | rassurer sur mon compte | P1 |

---

## 3. Règles fonctionnelles

### 3.1 Authentification et identification

- **RF-ME-01** : la requête doit porter `Authorization: Bearer <access_token>` (JWT, 15 min).
  Le `sub` du JWT = `user_id`.
- **RF-ME-02** : `GET /api/v1/me` ne retourne que les données du **compte propriétaire du token**
  (sub). Impossible de lire le profil d'un autre utilisateur via ce endpoint (pas d'`id` param).
- **RF-ME-03** : un compte `BANNED` reçoit `403 account_locked` (pas de fuite d'état). Un compte
  `PENDING_OTP` (inscription inachevée) n'a **pas** encore de profil publiable → accès restreint
  (voir §3.3 E-ME-06) : réponse 200 avec un profil « en création » **uniquement les champs définis**.

### 3.2 Contenu du profil

- **RF-ME-04** : le profil de l'appelé (`UserPublic` étendu) inclut :
  | Champ | Source | Notes |
  |---|---|---|
  | `id` | `users.users.id` | uuid |
  | `country_code` | `users.users.country_code` | « BJ » |
  | `phone` | `users.users.phone` | E.164 sans + |
  | `email` | `users.users.email` | nullable, jamais exposé si anonymisé |
  | `full_name` | `users.users.full_name` | |
  | `avatar_url` | nullable | S3, jamais de lien interne |
  | `locale` | `users.users.locale` | défaut fr |
  | `status` | `users.users.status` | ACTIVE/SUSPENDED/BANNED/plus |
  | `otp_verified_at` | nullable | traçable |
  | `created_at` | `users.users.created_at` | hérité de BaseEntity |
  | `roles` | `users.user_roles.role` | liste des rôles (MVP : 1) |
- **RF-ME-05** (ROLE) : si le rôle actif est `PROFESSIONAL` et qu'un profil `pros.profiles` existe,
  l'objet `professional` est embarqué (sous-objet) : `professional.id`, `status`, `verification_status`,
  `rating_avg`, `rating_count`, `trust_score`, `completed_jobs`, `business_name`, `location_name`.
  Aujourd'hui le MVP n'expose que ces champs agrégats (`06a` — `pros.profiles`).
- **RF-ME-06** (livreur) : si rôle `DELIVERER`, le sous-objet `deliverer` (zone de livraison, moyens) est
  renvoyé quand renseigné.
- **RF-ME-07** (RGPD) : si `anonymized_at` est posé → réponse `403 resource_unavailable` (compte
  anonymisé, données pseudonymisées) ; `email` absent de toute réponse après anonymisation.

### 3.3 Scénarios d'échec

| ID | Cas | Comportement attendu | HTTP |
|---|---|---|---|
| E-ME-01 | token absent / malformé | 401 `unauthorized` | 401 |
| E-ME-02 | token expiré (> 15 min) | 401 `token_expired` | 401 |
| E-ME-03 | token falsifié / sub inconnu | 401 `unauthorized` | 401 |
| E-ME-04 | compte SUSPENDED | 403 `account_locked` (message générique) | 403 |
| E-ME-05 | compte BANNED | 403 `account_locked` | 403 |
| E-ME-06 | compte PENDING_OTP (inscription en cours) | 200 profil « incomplet » (id, phone, status uniquement) | 200 |
| E-ME-07 | compte anonymisé (RGPD) | 403 `resource_unavailable` | 403 |

> Décision : le profil est **personnel** — les erreurs 401/403 sont génériques et ne révèlent
> ni l'état ni l'existence du compte (pas de fuite via `404` : tout token inconnu → 401, tout
> compte bloqué/anonymisé → 403).

---

## 4. Récapitulatif cible

| Méthode | Route | Auth | Réponses |
|---|---|---|---|
| GET | `/api/v1/me` | Bearer | 200 / 401 / 403 |

Le sous-lot englobe : garde `AuthGuard` (Bearer → claims, `sub`), décorateur `@CurrentUser()`,
service `ProfileService.getMe(userId)` (répond `UserMe`), DTO de sortie typés (Swagger-compatible).
Contrats techniques dans `31-api-contracts-users.md` et `32-services-users-contracts.md`.
Les cas de test sont dans `33-tests-users.md`.

---

> Note d'alignement : le header `Location: /api/v1/me` posé par `27-api-contracts-auth.md` §5
> (register 201) est **satisfait par ce endpoint** — cohérence maintenue.