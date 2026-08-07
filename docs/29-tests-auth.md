# Tests — Lot 6.2 : Authentification (cas Gherkin/xUnit)

> Livrable « Tests » de l'ordre **Alignement docs → Contrats API → Services métier → Tests → Implémentation**.
> **Aucune implémentation.** Sources : `26-spec-auth-lot-6-2.md` (§3–§8, D1–D5),
> `27-api-contracts-auth.md` (contrats API), `28-services-auth-contracts.md` (services),
> `13-strategie-tests.md` (pyramide, règle « rotations refresh 100 % »).
> Convention : GWT (Given/When/Then) pour E2E (supertest) ; tableaux de cas pour unitaires ;
> tests parallèles par domaine d'exécution — choix du framework Jest (déjà en place, `13 §3`).

---

## 1. Mapping niveaux de test

| Niveau (13) | Focus auth 6.2 | Outil |
|---|---|---|
| 2. Unitaires | use-cases (`OtpService`, `TokenService`, `SessionService`, `ProfileService`), valeur Bons OTP/normalisation | Jest (backend) |
| 3. Intégration | `OtpStorePort` (Redis), `SessionRepositoryPort`+rotation/rejeu, audit `authz.otp_codes`, verrou chances | Jest + testcontainers (PostgreSQL+Redis) comme `13 §4` |
| 4. E2E | parcours GWT (§3–§8) | supertest + base isolée |

**Priorité couverture** : règles métier critiques = 100 % : `ck_otp_attempts` (3 essais), cooldown 45 s,
fenêtre 5 envois/15 min, verrouillage 15 min, rotation refresh + rejet, transitions PENDING_OTP→ACTIVE.

---

## 2. Cas unitaires (xUnit — backend)

### 2.1 `OtpService.request`

| Cas | Résultat attendu |
|---|---|
| téléphone E.164 valide, cooldown OK, < 5 envois/15 min | OTP émis, `OtpRequested.expires_at = now+300s`, hash en audit, `OtpSenderPort.send` appelé 1× |
| téléphone invalide (lettres, trop court) | `PhoneInvalid` |
| cooldown 45 s non écoulé | `OtpCooldown` (retry_after = restant) |
| 5 envois faits / 15 min | `PhoneLocked` (retry_after 15 min) |
| `purpose=REGISTER` + numéro déjà ACTIVE | `PhoneAlreadyRegistered` |
| `purpose=REGISTER` → user `PENDING_OTP` créé (D3) | créé une seule fois ; 2ᵉ request = OTP émis sur le même user |
| `purpose=LOGIN` + compte inexistant | envoi autorisé (pas de fuite), user `PENDING_OTP` **non créé** en LOGIN pour un inconnu |
| échec `OtpSenderPort.send` × 2 retries | `SmsUnavailable` |
| send OK au 2ᵉ retry | succès (202), `send` appelé 2× |
| code type : `OtpCode.new()` | 6 chiffres, via CSPRNG, deux générations successives ≠ |

> **Note outillage** : clocks injectées (ClockPort) ; Redis simulé (faux store in-memory) pour unitaire.

### 2.2 `OtpService.verify`

| Cas | Résultat attendu |
|---|---|
| code exact, attempts 0→1 | `OtpVerified`, `used_at` posé, audit |
| code exact après 1 échec (attempts=1) | succès (2ᵉ essai) |
| code faux, attempts 0 | `OtpInvalid` + `attempts_left=2` |
| code faux, attempts 1 | `OtpInvalid` + `attempts_left=1` |
| code faux, attempts 2 | `OtpExhausted` (3ᵉ échec, `ck_otp_attempts` atteint), code invalidé |
| code juste mais `used_at` déjà non nul | `OtpAlreadyUsed` |
| OTP > 5 min (clé peek expired) | `OtpExpired` |
| aucun OTP (store vide) | `NoPendingOtp` |
| canal verrouillé (phone_locked) | `PhoneLocked` + Retry-After |
| `purpose=LOGIN` après verify succès | `OtpVerified.user_id` retourné (pour délivrance tokens) |
| `purpose=REGISTER` après verify succès | `user_id` absents (pas de délivrance) |

### 2.3 `TokenService`

| Cas | Résultat attendu |
|---|---|
| `issueAccess` (USER ACTIVE, device) | JWT RS256, claims `sub/role/device_id/jti/exp=+900s`, signature valide |
| `verifyAccess` token valide | claims restitués |
| `verifyAccess` token expiré (+16 min) | `RefreshExpired` → `token_expired` |
| `verifyAccess` token falsifié | `RefreshUnknown` → `unauthorized` |
| `issueRefresh` | token opaque ≥ 32 octets, `token_hash` SHA-256 en base, `expires_at=+30j` |
| `rotate` valid refresh | ancien `replaced_by` posé, retour nouveaux tokens |
| `rotate` même token 2× | 2ᵉ → `RefreshReused`, **famille entière révoquée** (tous les `revoked_at` non nuls) |
| `rotate` token déjà `revoked_at` | `RefreshReused` |
| `rotate` token expiré (< 30 j) | `RefreshExpired` |
| `rotate` device_id ≠ session | `DeviceMismatch`→`invalid_device` |
| concurrence : 2 `rotate` simultanés même token | 1 succès, 1 `RefreshReused` (verrou Redis) |

### 2.4 `SessionService`

| Cas | Résultat attendu |
|---|---|
| `revoke` active session | `revoked_at=now`, événement `auth.session.revoked` (reason logout) |
| `revoke` session déjà révoquée | succès silencieux (idempotent) |
| `revokeAll` | toutes les sessions actives `revoked_at=now` |
| `listActive` | uniquement sessions `revoked_at IS NULL` et `expires_at > now` |

### 2.5 `ProfileService`

| Cas | Résultat attendu |
|---|---|
| user PENDING_OTP + OTP vérifié + profil CLIENT (cgv) | transaction `ACTIVE`, `otp_verified_at`, événement `user.registered`, tokens émis |
| nom < 2 car. | `ConstraintViolation` → `validation_failed` |
| rôle PRO sans `category_id` / `division_id` / `locality_id` | `CategoryRequired` / `LocalityRequired` (422) |
| rôle LIVREUR sans `delivery_zone` | `ZoneRequired` (422) |
| sans `consent.cgv` | `ConsentRequired` (422) |
| user non vérifié OTP (aucun `otp_verified_at`) | `OtpNotVerified` (403) |
| course : deux `completeRegistration` simultanés même user_id | 1 gagne, l'autre `PhoneAlreadyActive` (FOR UPDATE) |
| PRO | profil enregistré `verification_status=UNVERIFIED` |

---

## 3. Cas d'intégration (testcontainers : PG 16+PostGIS + Redis)

| Cas | Assertions |
|---|---|
| `OtpStore` Redis : TTL 300 s des clés OTP, compteurs cooldown/fenêtre | clés expirées après TTL (observe `pttl` ou re-lecture) |
| `cooldown 45 s` persiste entre deux requêtes (même process) | deuxième `otp/request` → 429 |
| fenêtre 15 min : 5ᵉ envoi bloqué → `423` | lock posé en Redis avec TTL 900 s |
| verify 3ᵉ échec → clé OTP supprimée de Redis | aucun autre essai possible |
| `authz.otp_codes` : chaque `request` → 1 row d'audit (`purpose`, `code_hash` SHA-256, `attempts`); jamais code en clair |
| rejeu refresh → famille révoquée en PG (verification ≥ 2 `revoked_at`) |
| purge `PENDING_OTP > 24 h` (job) | supprimés |
| purge refresh > 90 j | supprimés |

---

## 4. Cas E2E (Gherkin — scénarios P0, supertest)

### G1 — Inscription complète (REGISTER)
```
Given un numéro BJ valide sans compte
When je demande OTP (REGISTER) puis je vérifie avec le bon code
Then je reçois 202 puis 200 ; le compte passe ACTIVE après register ; tokens émis
```
| # | Scénario | Attendu |
|---|---|---|
| G1-OTP-REQ | `POST /auth/otp/request` (BJ) | 202 + `expires_at` ; pas de code dans la réponse |
| G1-OTP-VER | suis prompt register `purpose=REGISTER` | 200 `{status:"otp_verified"}` |
| G1-REG | `POST /auth/register` (CLIENT, cgv) | 201 `{tokens,userACTIVE}` + `Location` |
| G1-DUP | re-register même numéro | 409 `phone_already_registered` |

### G2 — Connexion (LOGIN)
```
Given compte ACTIVE et OTP LOGIN
When je vérifie le code (LOGIN)
Then tokens + user ; session créée
```
| # | Scénario | Attendu |
|---|---|---|
| G2-OTP-LOGIN | `otp/verify` purpose=LOGIN code ok | 200 `{tokens,user}` |
| G2-BADCODE | code faux | 401 `otp_invalid` + `attempts_left` |
| G2-LOCK | 3ᵉ échec | 423 `otp_exhausted` |
| G2-SUSPENDED | compte suspendu | 403 `account_locked` |

### G3 — Rotation refresh (critique)
| # | Scénario | Attendu |
|---|---|---|
| G3-REF-OK | `POST /auth/refresh` token valide | 200 nouveaux tokens ; l'ancien `replaced_by` |
| G3-REF-REUSE | rejouer l'ancien token | 401 `refresh_reused` ; toutes les sessions de la famille révoquées |
| G3-REF-EXP | token > 30 j | 401 `refresh_expired` |

### G4 — Déconnexion
| # | Scénario | Attendu |
|---|---|---|
| G4-LOG | logout avec refresh valide | 204 ; refresh suivant → 401 |
| G4-LOG-2 | logout deux fois | 204 (idempotent) |
| G4-ALL | logout-all | 204 ; toutes les sessions révoquées |

### G5 — Rate limiting & sécurité
| # | Scénario | Attendu |
|---|---|---|
| G5-COOL | 2ᵉ otp/request < 45 s | 429 `otp_cooldown` + Retry-After |
| G5-LOCK | 6ᵉ otp/request / 15 min | 423 `phone_locked` + Retry-After |
| G5-EXHAUST | 3 essais faux sur un code | 423 `otp_exhausted` |
| G5-HASH | inspection DB | `code_hash` ≠ code ; `token_hash` ≠ token (assertion) |
| G5-SMOKE | brute-force 10 essais | verrouillage effectif (pas de 200 avant 15 min) |
| G5-FUITE | `otp/verify` sur numéro jamais demandé | 404 générique (message identique en REGISTER/LOGIN) |

> Les scénarios E2E (supertest) se regroupent dans `apps/api/test/auth/*.spec.ts` (convention Nest/nx) —
> numérotation FCT-001/002 de `08`.

---

## 5. Table de couverture (trace spec → tests)

| Spec (§26) | Cas | Couvert |
|---|---|---|
| §3 Inscription (E-INS, T-INS) | 2.1 + G1 | ok |
| §4 Vérif OTP (E-OTP, T-OTP) | 2.2 + G2 | ok |
| §5 Création (E-CPT, T-CPT) | 2.5 + G1-REG | ok |
| §6 Connexion (RF-CON, T-CON) | 2.3 + G2/G3 | ok |
| §7 Déconnexion (T-LOG) | 2.4 + G4 | ok |
| §8 Sécurité (T-SEC) | 2.1/2.2 + G5 | ok |

---

## 6. Critères d'acceptation (avant implémentation)

- [ ] Tous les cas xUnit ci-dessus passent (Jest backend), couverture domaine `auth` ≥ 80 % (`13 §2`).
- [ ] Rotations refresh & rejeu : 100 % des cas (règle critique `13 §2`).
- [ ] E2E supertest G1–G5 verts sur postgres-testcontainer + Redis.
- [ ] Les assertions « hash ≠ clair » et « pas de fuite d'existence » présentes dans chaque niveau concerné.
- [ ] CI existante (`ci-backend.yml`) : `nx lint`, `nx test`, `nx build` — les suites auth s'ajoutent sans dégradation.

> Note : ce document est le **contrat de test** ; la série d'implémentation devra les matérialiser
> en fichiers `*.spec.ts` sans modifier ces cas (sauf ajout documenté).