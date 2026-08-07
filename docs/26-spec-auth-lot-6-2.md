# Spécification fonctionnelle — Lot 6.2 : Authentification

> Livrable de cadrage, **aucune implémentation** n'est faite dans ce document.
> Sources : `02-adr.md` (ADR-004), `06a-tables-mvp-core.md`, `07f-ux-writing.md`, `07g-user-stories.md`,
> `08-specification-fonctionnelle.md`, `10-blueprint-backend.md`, `12-api-blueprint.md`, `15-securite.md`,
> `03-uml-diagrammes.md`.

---

## 1. Principes directeurs (décisions déjà actées)

| Sujet | Décision |
|---|---|
| Accès | JWT access token **15 min** (ADR-004) |
| Session | Refresh token **30 j**, **rotation à chaque usage**, famille + détection de rejeu (ADR-004) |
| OTP | SMS obligatoire à l'inscription (un numéro = un compte) ; optionnel pour actions sensibles (ADR-004) |
| OTP chaud | Vit en **Redis** (vérification), la table `authz.otp_codes` est la **trace d'audit** (ADR-004, 06a) |
| Hash | OTP et refresh token stockés **hashés** (SHA-256), jamais en clair (06a) |
| Numéro | `country_code` (2 chars) + `phone` (≤ 20, unique — `uq_users_phone`) |
| Statuts user | `PENDING_OTP → ACTIVE → SUSPENDED / BANNED` (06a) |

**État du document : DÉCISIONS FINALES (validé)** — les 5 points ouverts sont tranchés (cf. §11).
Les ambiguïtés « 3 vs 5 essais » sont résolues : **3 essais par code**, aligné sur la contrainte
réelle `ck_otp_attempts (attempts BETWEEN 0 AND 3)` en migration `001-initial-schema.ts`.

---

## 2. User Stories

| ID | En tant que… | je souhaite… | afin de… | Priorité |
|---|---|---|---|---|
| US-6.2-01 | visiteur | m'inscrire avec mon téléphone | créer mon compte | P0 |
| US-6.2-02 | visiteur | recevoir un code OTP par SMS | prouver que le numéro est à moi | P0 |
| US-6.2-03 | visiteur | renvoyer le code OTP (cooldown 45 s) | le recevoir si le SMS est perdu | P0 |
| US-6.2-04 | visiteur | saisir mon profil (nom, rôle) après OTP validé | terminer mon inscription | P0 |
| US-6.2-05 | client/pro/livreur | me connecter par téléphone + OTP | accéder à mon compte | P0 |
| US-6.2-06 | utilisateur connecté | rester connecté (refresh rotatif) | ne pas ressaisir l'OTP à chaque ouverture | P0 |
| US-6.2-07 | utilisateur | me déconnecter | révoquer ma session | P0 |
| US-6.2-08 | utilisateur | connaître mes essais restants | comprendre l'erreur OTP | P1 |
| US-6.2-09 | client/pro/livreur | être informé qu'un numéro est déjà inscrit | me connecter au lieu de recréer | P1 |

---

## 3. 6.2.1 — Inscription (saisie téléphone)

### Règles fonctionnelles

- **RF-INS-01** : format téléphone : `country_code` (2 lettres, ex. `BJ`) + numéro
  8–15 chiffres, sans `+` ni espaces (normalisation E.164 par le backend).
- **RF-INS-02** : un numéro ne peut être inscrit qu'une fois (unique `uq_users_phone`).
- **RF-INS-03** : l'envoi OTP est soumis au **cooldown 45 s** par numéro (Redis).
- **RF-INS-04** : l'OTP est un code **6 chiffres**, valide **5 min**, usage unique.
- **RF-INS-05** : **3 essais max** par code (contrainte `ck_otp_attempts`) ; au 3ᵉ échec,
  le code est invalidé (D1).
- **RF-INS-06** : **max 5 envois d'OTP / 15 min** par numéro ; au-delà, le canal téléphone est
  **verrouillé 15 min** (état `LOCKED` côté Redis ; événement `auth.user.locked` pour l'audit) (D1).
- **RF-INS-07** : le compte est créé dès la demande d'OTP avec statut `PENDING_OTP`
  (sans profil) ; il ne devient `ACTIVE` qu'après OTP vérifié + profil complété (D3).
  Si l'OTP expire : le user `PENDING_OTP` reste, une nouvelle demande est possible ;
  purge après 24 h sans vérification.
- **RF-INS-08** : le SMS est envoyé via l'adapter `SMS` (SMS Bénin/Intouch, Phase 1) ;
  en **mode dev/test**, le code est journalisé (jamais en prod).

### Scénarios d'échec

| ID | Cas | Comportement attendu | HTTP |
|---|---|---|---|
| E-INS-01 | numéro malformé (lettres, trop court, trop long) | 422 `validation_failed` + champ précis | 422 |
| E-INS-02 | cooldown 45 s non écoulé | 429 `otp_cooldown` + `retry_after: 45` | 429 |
| E-INS-03 | numéro déjà actif (ré-inscription) | 409 `phone_already_registered` (message : « connectez-vous ») | 409 |
| E-INS-04 | canal verrouillé | 423 `phone_locked` + `retry_after` | 423 |
| E-INS-05 | provider SMS injoignable | échec silencieux côté client ; l'utilisateur renvoie via US-6.2-03 ; **retry interne 2×** | 202 (même réponse) |

### Cas de test (inscription)

| ID | Précondition | Action | Résultat attendu |
|---|---|---|---|
| T-INS-01 | — | POST `/auth/otp/request` avec téléphone valide | 202, OTP émis (audit `authz.otp_codes`), SMS envoyé |
| T-INS-02 | — | POST avec numéro invalide | 422, aucun OTP émis |
| T-INS-03 | OTP émis il y a 10 s | second POST | 429 `otp_cooldown` |
| T-INS-04 | numéro déjà ACTIVE | POST | 409 `phone_already_registered` |
| T-INS-05 | 5 envois déjà faits dans la fenêtre de 15 min | POST | 423 `phone_locked` (15 min) |
| T-INS-06 | — | POST | `code_hash` SHA-256 en base, jamais le code en clair |

---

## 4. 6.2.2 — Vérification OTP

### Machine à états — OTP (Redis + audit)

```
                    ┌──────────┐
   request ───────► │ PENDING  │◄─────── cooldown 45 s (resend)
                    └────┬─────┘
                         │ verify (correct)
                         ▼
                    ┌──────────┐
   3 essais échoués │ INVALID  │   ┌──────────┐
   ───────────────► │(audit)   │   │ EXPIRED  │◄──── 5 min écoulées
                    └──────────┘   └──────────┘
                         │              │
                         └──► SUCCESS (usage unique : `used_at`)
```

Transitions :
1. `request` → `PENDING` (émission, TTL 5 min, attempts=0)
2. `PENDING` → `SUCCESS` : code correct et non utilisé (passe `used_at = now`)
3. `PENDING` → `INVALID` : 3 essais échoués (`attempts = 3`, invalidation)
4. `PENDING` → `EXPIRED` : TTL expiré (aucun usage possible)
5. `SUCCESS` → retour `INVALID` : tout nouvel essai avec un code déjà `used_at` → `otp_already_used`

### Scénarios d'échec

| ID | Cas | Comportement attendu | HTTP |
|---|---|---|---|
| E-OTP-01 | code incorrect (essais restants) | 401 `otp_invalid` + `attempts_left` | 401 |
| E-OTP-02 | code expiré (> 5 min) | 410 `otp_expired` → inviter au renvoi | 410 |
| E-OTP-03 | code déjà utilisé (`used_at` non nul) | 409 `otp_already_used` | 409 |
| E-OTP-04 | plus d'essais | 423 `otp_exhausted` → renvoi obligatoire | 423 |
| E-OTP-05 | canal verrouillé | 423 `phone_locked` + `retry_after` | 423 |
| E-OTP-06 | téléphone inconnu à la vérif | 404 `phone_not_found` (générique : pas de fuite d'existence) | 404 |

### Cas de test (vérification)

| ID | Précondition | Action | Résultat attendu |
|---|---|---|---|
| T-OTP-01 | OTP valide | POST `/auth/otp/verify` code correct | 200, `used_at` positionné |
| T-OTP-02 | OTP valide | code incorrect ×1 | 401 + `attempts_left: 2` |
| T-OTP-03 | OTP valide | code incorrect ×3 | 423 `otp_exhausted` ; code invalidé |
| T-OTP-04 | OTP validé une fois | re-POST même code | 409 `otp_already_used` |
| T-OTP-05 | OTP émis il y a 6 min | verify | 410 `otp_expired` |
| T-OTP-06 | — | verify sans OTP émis | 404 `phone_not_found` (réponse générique) |

---

## 5. 6.2.3 — Création du compte

Après `SUCCESS` OTP, l'utilisateur complète son profil : `POST /auth/register`.

### Règles par rôle

| Rôle | Champs obligatoires | Règles spécifiques |
|---|---|---|
| `CLIENT` | `full_name` (2–80 car.), consentements (CGV obligatoire, confidentialité) | aucun supplément MVP |
| `PROFESSIONAL` | `full_name`, **catégorie** (référentiel 20), **localité** (référentiel Bénin) | vérification d'identité (CIN) reportée — profil marqué `UNVERIFIED` |
| `DELIVERY_PERSON` | `full_name`, zone de livraison (commune), moyen de transport | vérification reportée — marqué `UNVERIFIED` |

- **RF-CPT-01** : le rôle est choisi à l'inscription et verrouillé au niveau d'application
  (la création d'un second compte avec le même téléphone = 409) (D5).
- **RF-CPT-02** : le statut passe `PENDING_OTP → ACTIVE` à la création du compte
  (transactionnel) ; `otp_verified_at` est posé à ce moment (D3).
- **RF-CPT-03** : consentements requis (`cgv` obligatoire, DLG-009) ; sans CGV → 422.
- **RF-CPT-05** : l'inscription PRO/Livreur n'accorde **aucun privilège** tant que la
  vérification (CIN/zone) n'est pas faite (phase ultérieure) — flag `verification_status: UNVERIFIED`.

### Cas de test (création)

| ID | Précondition | Action | Résultat attendu |
|---|---|---|---|
| T-CPT-01 | OTP vérifié | POST `/auth/register` complet (client) | 201, user `ACTIVE`, `otp_verified_at` |
| T-CPT-02 | OTP vérifié | register sans CGV | 422 `consent_required` |
| T-CPT-03 | OTP vérifié | register nom < 2 car. | 422 `validation_failed` |
| T-CPT-04 | compte déjà ACTIVE | register même numéro | 409 `phone_already_registered` |
| T-CPT-05 | OTP vérifié | register rôle PRO sans catégorie | 422 `category_required` |
| T-CPT-06 | OTP vérifié | register rôle LIVREUR sans zone | 422 `delivery_zone_required` |
| T-CPT-07 | — | register sans OTP vérifié | 403 `otp_not_verified` |

---

## 6. 6.2.4 — Connexion

### Règles fonctionnelles

- **RF-CON-01** : connexion = demande OTP (`POST /auth/otp/request`, purpose `LOGIN`) puis
  `POST /auth/otp/verify` (purpose `LOGIN`).
- **RF-CON-02** : à la vérification réussie, le serveur délivre :
  - `access_token` (JWT, **15 min**, claims : `sub`, `role`, `device_id`, `jti`) ;
  - `refresh_token` (opaque, **30 j**, hashé en `authz.refresh_tokens`, rotation) ;
  - `user` (profil minimal : id, nom, rôle, statut).
- **RF-CON-03** : `refresh_token` lié à `device_id`, `ip`, `user_agent` (traçabilité, 06a).
- **RF-CON-04** : rotation : chaque usage du refresh remplace l'ancien
  (`replaced_by`, famille) ; la **réutilisation d'un token déjà remplacé** → révocation
  de toute la famille (détection de vol) + `auth.session.revoked`.
- **RF-CON-05** : un compte `SUSPENDED`/`BANNED` ne peut pas se connecter (403 `account_suspended`).

### Machine à états — Session (refresh)

```
             ┌────────────────────┐   refresh + rotate   ┌───────────────────┐
  login ───► │ ACTIVE             │ ────────────────────► │ ACTIVE (nouveau)  │
             └────────────────────┘                      └───────────────────┘
                    │  reuse détecté / logout / 30 j
                    ▼
             ┌────────────────────┐
             │ REVOKED (famille)  │
             └────────────────────┘
```

### Cas de test (connexion)

| ID | Précondition | Action | Résultat attendu |
|---|---|---|---|
| T-CON-01 | compte ACTIVE | otp/request (LOGIN) + verify | 200 : access + refresh + user |
| T-CON-02 | compte ACTIVE | refresh valide | 200 : nouveaux tokens, ancien invalidé (`replaced_by`) |
| T-CON-03 | — | refresh déjà utilisé | 401 `refresh_reused` + famille révoquée |
| T-CON-04 | — | access token expiré (16 min) | 401 `token_expired` |
| T-CON-05 | compte SUSPENDED | otp/verify | 403 `account_suspended` |
| T-CON-06 | — | refresh > 30 j | 401 `refresh_expired` |
| T-CON-07 | — | refresh d'un autre device | 401 `invalid_device` |

---

## 7. 6.2.5 — Déconnexion

### Règles fonctionnelles

- **RF-LOG-01** : `POST /auth/logout` (Bearer access + body `{refresh_token}`) →
  `revoked_at` positionné sur le refresh (révocation ciblée).
- **RF-LOG-02** : la suppression du token côté client est une **responsabilité du client**
  (le serveur ne peut pas l'imposer).
- **RF-LOG-03** : `POST /auth/logout-all` (option) révoque **tous** les refresh de l'utilisateur
  (toutes familles) — cas « appareil perdu ».
- **RF-LOG-04** : logout est **idempotent** : révoquer une session déjà révoquée → 204 (pas d'erreur).
- **RF-LOG-05** : l'événement `auth.session.revoked` est émis (audit).

### Cas de test (déconnexion)

| ID | Précondition | Action | Résultat attendu |
|---|---|---|---|
| T-LOG-01 | session active | logout | 204 ; refresh `revoked_at` ; refresh ultérieur → 401 |
| T-LOG-02 | session active | logout ×2 | 204 les deux fois (idempotent) |
| T-LOG-03 | 2 sessions (2 devices) | logout-all | 204 ; les 2 refresh révoqués |
| T-LOG-04 | session active | logout sans Bearer | 401 `unauthorized` |

---

## 8. 6.2.6 — Sécurité

| Règle | Valeur MVP | Source |
|---|---|---|
| Limitation OTP | Envoi : 1 req / 45 s, **max 5 envois / 15 min** → `phone_locked` 15 min. Vérification : **3 essais / code** → `otp_exhausted`. | D1, 06a |
| TTL OTP | 5 min (Redis TTL) | ADR-004 |
| Durée access | 15 min | ADR-004 |
| Durée refresh | 30 j, rotation, famille + détection rejeu | ADR-004 |
| Hash | OTP : SHA-256 (`code_hash`) ; refresh : SHA-256 (`token_hash`) — jamais en clair | 06a |
| Blocage | `SUSPENDED`/`BANNED` : connexion refusée ; pas d'envoi OTP sur numéro banni | 06a |
| Journalisation | événements : `user.registered`, `user.logged_in`, `user.locked`, `session.revoked`, `otp.attempt_failed` ; audit `otp_codes` (champ `error_code`) | 10, 15 |
| OTP prod | jamais journalisé en clair ; dev/test uniquement | 15 §5 |
| Fuite d'existence | réponses génériques (404 vs 409) maîtrisées — pas de fuite par message | 12 |
| JWT signing | HS256/RS256 avec secret de prod hors repo (`.env`) | 12 |

### Cas de test (sécurité)

| ID | Précondition | Action | Résultat attendu |
|---|---|---|---|
| T-SEC-01 | — | brute-force OTP (10 essais sur 4 codes) | 3ᵉ essai d'un code → `otp_exhausted` ; 6ᵉ envoi dans la fenêtre de 15 min → `phone_locked` (D1) |
| T-SEC-02 | — | rejeu du refresh | famille révoquée ; événement sécurité émis |
| T-SEC-03 | — | accès avec token falsifié | 401 `unauthorized` |
| T-SEC-04 | — | vérif que `code_hash`/`token_hash` en base ≠ code en clair | assertion DB |
| T-SEC-05 | — | numéro BANNED | aucun OTP envoyé, réponse générique |

---

## 9. Récapitulatif endpoints (cible 6.2)

| Méthode | Route | Body | Réponses |
|---|---|---|---|
| POST | `/auth/otp/request` | `{country_code, phone, purpose: REGISTER\|LOGIN, device?}` | 202 / 422 / 429 / 409 / 423 |
| POST | `/auth/otp/verify` | `{country_code, phone, code, purpose, device?}` | 200 / 401 / 410 / 409 / 423 / 404 |
| POST | `/auth/otp/resend` | `{country_code, phone, purpose}` | 202 / 429 (cooldown) |
| POST | `/auth/register` | `{phone, country_code, full_name, role, consent{...}, category?, delivery_zone?}` | 201 / 422 / 403 / 409 |
| POST | `/auth/login` | `{country_code, phone, code, device?}` | 200 (tokens+user) / 401 / 410 / 423 |
| POST | `/auth/refresh` | `{refresh_token}` | 200 (tokens) / 401 |
| POST | `/auth/logout` | `{refresh_token}` (Bearer) | 204 / 401 |
| POST | `/auth/logout-all` | (Bearer) | 204 / 401 |

> Alignement DTO : `RequestOtpDto`, `VerifyOtpDto`, `RefreshDto` (10-blueprint-backend).

---

## 11. Décisions finales (points ouverts tranchés)

| # | Point | Décision ferme | Justification |
|---|---|---|---|
| D1 | Nombre d'essais OTP | **3 essais par code** (un seul, partout). En plus : **max 5 demandes d'OTP / 15 min** par numéro (rate limit envoi), sinon **verrouillage canal 15 min** (Redis). | Aligné sur `ck_otp_attempts (BETWEEN 0 AND 3)` existant (migration 001). Le « 5 essais/15 min » de `12-api-blueprint` devient **5 envois/15 min** (limite d'émission, pas de vérification) — cohérent avec `15-securite.md §5` (cooldown 45 s + max 5 requêtes/15 min). |
| D2 | Provider SMS | **Adapter + mock en dev** pour le lot 6.2 : `SmsAdapter` (interface) + implémentations `ConsoleSmsProvider` (dev/test, journalise le code) et `HttpSmsProvider` (stub prêt à brancher SMS Bénin/Intouch). Aucun appel réseau réel au MVP. | Aucun compte/crédit SMS disponible ; le contrat (interface) permet le branchement réel sans refonte (ADR-004 : « l'interface le permettra »). |
| D3 | Cycle PENDING_OTP | L'utilisateur est créé **dès la demande OTP** (statut `PENDING_OTP`, sans profil). Il devient `ACTIVE` **à la création du compte** (après OTP vérifié, `otp_verified_at` posé). Si l'OTP expire ou échoue : **le user PENDING_OTP reste** (réutilisable pour une nouvelle demande) ; **purge après 24 h sans vérification** (nettoyage TTL + job). | Table `users.users` `DEFAULT 'PENDING_OTP'` ; évite une 2ᵉ étape de création implicite ; `uq_users_phone` protège le numéro dès l'émission. |
| D4 | Refresh token | **Rotation par famille confirmée** : chaque usage invalide l'ancien (`replaced_by`), une réutilisation d'un token déjà remplacé = **rejeu → révocation de toute la famille** (`revoked_at` sur toute la chaîne) + événement `auth.session.revoked`. Expiration 30 j ; logout révoque la session ciblée. | ADR-004 + table `refresh_tokens` (`replaced_by`, `revoked_at`) déjà en place ; comportement « détection de vol » exigé par `12-api-blueprint`. |
| D5 | Rôles | Le rôle est **verrouillé à la création du compte** (choisi à l'inscription, jamais modifiable via API publique). Les différences Client/Pro/Livreur sont **encodées dès la création** : `CLIENT` (aucun supplément), `PROFESSIONAL` (`category_id` + `locality_id` obligatoires, `verification_status=UNVERIFIED`), `DELIVERY_PERSON` (`delivery_zone` obligatoire, `verification_status=UNVERIFIED`). | Évite des règles dispersées ; vérification (CIN/zone) = lot ultérieur, le statut `UNVERIFIED` ne bloque pas la création. |

**Conséquence** : `12-api-blueprint.md` et `15-securite.md` seront mis en cohérence (doc uniquement) :
- envoi OTP : cooldown 45 s + **max 5 envois / 15 min** → verrouillage canal 15 min ;
- vérification OTP : **3 essais par code** (`ck_otp_attempts`), au 3ᵉ échec le code est invalidé.

---

