# Services métier — Lot 6.2 : Authentification (contrats d'interface)

> Livrable « Services métier » de l'ordre **Alignement docs → Contrats API → Services métier → Tests → Implémentation**.
> **Aucune implémentation.** Sources : `27-api-contracts-auth.md` (contrats API figés),
> `26-spec-auth-lot-6-2.md` (D1–D5), `10-blueprint-backend.md` MOD-01 (ports/adaptateurs),
> `06a-tables-mvp-core.md` (authz.otp_codes, authz.refresh_tokens), `02-adr.md` ADR-004.
> Convention : hexagone — les services métier ne dépendent que d'**interfaces (ports)** ; les
> adaptateurs (TypeORM, Redis, SMS, JWT) sont fournis à l'implémentation.

---

## 1. Périmètre

Services du module `auth` pour le lot 6.2 :

| Service | Responsabilité | Use-cases couverts |
|---|---|---|
| `OtpService` | émission, vérification, cooldown, verrouillage OTP | RegisterWithOtp (partie OTP), LoginWithOtp (partie OTP), ResendOtp |
| `TokenService` | access JWT, refresh rotatif, famille, détection de rejeu | RefreshSession, délivrance tokens |
| `SessionService` | sessions actives, révocation ciblée/globale | Logout, LogoutAll, listing sessions |
| `ProfileService` | complétion du profil, règles par rôle, transition PENDING_OTP→ACTIVE | RegisterWithOtp (partie profil) |

Services **hors périmètre 6.2** (référencés, non implémentés ici) : `RiskService` (vélocité IP/device,
évoqué par le blueprint, activation P2) · `VerifyDevice` (NT-017, post-MVP) · `AdminTOTPLogin` (admin, autre lot).

---

## 2. Ports (interfaces sortantes — l'hexagone dépend d'eux)

| Port | Méthodes | Fourni par |
|---|---|---|
| `OtpSenderPort` | `send(otp: OtpMessage): Promise<void>` | `SmsOtpAdapter` (mock `ConsoleSmsProvider` en dev, D2) |
| `TokenManagerPort` | `signAccess(payload): string` · `verifyAccess(token): TokenClaims` | `JwtAdapter` |
| `SessionRepositoryPort` | `save(rt: RefreshToken)` · `findByHash(hash)` · `revoke(id, replacedById?)` · `revokeAllForUser(userId)` | `TypeOrmSessionRepository` |
| `OtpStorePort` | `save(pending: PendingOtp)` · `find(phone, purpose)` · `consume(id)` · `invalidate(id)` · `failedAttempt(id)` · `isLocked(phone)` · `lock(phone, ttl)` | `RedisOtpStore` (état chaud, ADR-004) |
| `UserRepositoryPort` | `findByPhone(cc, phone)` · `createPending(cc, phone, purpose)` · `markOtpVerified(userId)` · `completeProfile(userId, profile)` · `updateStatus(userId, status)` | `TypeOrmUserRepository` (schéma `users`) |
| `OtpAuditRepositoryPort` | `record(row: OtpAudit)` | `TypeOrmOtpAudit` (table `authz.otp_codes`, trace d'audit) |
| `EventPublisherPort` | `publish(event: AuthEvent)` | `EventEmitterAdapter` (Redis pub/sub P3) |
| `ClockPort` | `now(): Date` | `SystemClock` (injectable, remplacé par fake en test) |

> Règle hexagonale (ADR-001) : `auth` n'importe **jamais** l'implémentation d'un autre module ;
> `UserRepositoryPort` est une interface possédée par `auth` mais satisfaite par un adaptateur
> du module `users` ou un mapping local de la table `users.users` (décision à l'implémentation,
> voir §8 D-PORT-1).

---

## 3. Contrat `OtpService`

```ts
interface OtpService {
  /** Émet un OTP 6 chiffres (TTL 5 min, usage unique). Applique cooldown 45 s + max 5 envois/15 min. */
  request(input: RequestOtpInput): Promise<OtpRequested>;
  /** Re-émet (cooldown conservé) — appelé par US-6.2-03. */
  resend(input: ResendOtpInput): Promise<OtpRequested>;
  /** Vérifie le code ; gère 3 essais/code (ck_otp_attempts), invalidation, used_at. */
  verify(input: VerifyOtpInput): Promise<OtpVerified>;
}
```

**Types d'entrée/sortie**
```ts
interface RequestOtpInput  { country_code: string; phone: string; purpose: OtpPurpose; device?: DeviceInfo }
interface OtpRequested     { expires_at: Date; retry_after_seconds: number }        // code jamais renvoyé
interface ResendOtpInput   { country_code: string; phone: string; purpose: OtpPurpose }
interface VerifyOtpInput   { country_code: string; phone: string; code: string; purpose: OtpPurpose; device?: DeviceInfo }
interface OtpVerified      { user_id?: string; status: 'otp_verified' }             // user_id si LOGIN
```

**Erreurs métier (mapping HTTP en couche API)**
| Erreur | Mapping | Détails |
|---|---|---|
| `PhoneInvalid` | 422 `validation_failed` | raison `invalid_phone` |
| `OtpCooldown` | 429 `otp_cooldown` | `retry_after: 45` (secondes restantes) |
| `PhoneLocked` | 423 `phone_locked` | `retry_after` (verrouillage 15 min, D1) |
| `PhoneAlreadyRegistered` | 409 `phone_already_registered` | uniquement pour `purpose=REGISTER` |
| `NoPendingOtp` | 404 `phone_not_found` | réponse générique |
| `OtpInvalid` | 401 `otp_invalid` | `meta.attempts_left` (2, 1, 0) |
| `OtpExhausted` | 423 `otp_exhausted` | code invalidé, renvoi requis |
| `OtpExpired` | 410 `otp_expired` | > 5 min, renvoi requis |
| `OtpAlreadyUsed` | 409 `otp_already_used` | `used_at` déjà posé |
| `SmsUnavailable` | 503 `provider_unavailable` | après 2 retries internes |

**Règles encapsulées (D1/D3)**
- `request` : valide format (E.164) → check cooldown → check fenêtre 15 min (5 max) → crée user `PENDING_OTP`
  si `REGISTER` (D3) → génère 6 chiffres aléatoires (CSPRNG) → hash SHA-256 → sauve OTP chaud (Redis, TTL 300 s)
  + trace d'audit → `OtpSenderPort.send` (2 retries internes en cas d'échec).
- `verify` : lock → charge OTP chaud → code → `used_at` → audit. `REGISTER` : `markOtpVerified` (ne délivre
  **pas** de token, contrat §3). `LOGIN` : vérifie compte `ACTIVE` → `markOtpVerified` + notifie délivrance.
- `attempts` incrémenté à chaque échec ; à 3 → `OtpExhausted` + invalidation du code.

---

## 4. Contrat `TokenService`

```ts
interface TokenService {
  /** Signe l'access token JWT (claims standard + jti + device_id). TTL 15 min. */
  issueAccess(user: UserPublic, device?: DeviceInfo): string;
  /** Émet un refresh token opaque + enregistre sa famille (hash SHA-256 en base). */
  issueRefresh(user: UserPublic, device: DeviceInfo): Promise<string>;
  /** Fait tourner le refresh : invalide l'ancien (replaced_by), émet le nouveau. */
  rotate(refreshToken: string): Promise<RotatedTokens>;
  /** Valide un access token et retourne les claims. */
  verifyAccess(token: string): TokenClaims;
}
interface RotatedTokens { access_token: string; refresh_token: string; expires_in: number }
interface TokenClaims    { sub: string; role: UserRole; device_id: string; jti: string; exp: number }
```

**Erreurs métier**
| Erreur | Mapping |
|---|---|
| `RefreshUnknown` | 401 `unauthorized` (token inconnu/corrompu) |
| `RefreshExpired` | 401 `refresh_expired` (> 30 j ou `expires_at` passé) |
| `RefreshReused` | 401 `refresh_reused` → **révocation de toute la famille** + événement (D4) |
| `DeviceMismatch` | 401 `invalid_device` (`device_id` diffère de la session) |

**Règles encapsulées (D4/ADR-004)**
- `issueRefresh` : `token_hash = SHA-256(opaque)` (jamais stocké en clair), `expires_at = now+30j`,
  `device_id`, `ip`, `user_agent` (06a).
- `rotate` : lookup par hash → si `revoked_at` → rejeu → `SessionRepositoryPort.revokeAllForUser` (famille) ;
  si `replaced_by` non nul → rejeu (même traitement) ; sinon rotation : `revoke(ancien, nouveauId)`,
  événement `auth.session.rotated` (trace). Idempotence : deux `rotate` concurrents sur le même token →
  un seul gagne (verrou Redis sur hash), l'autre → `RefreshReused`.

---

## 5. Contrat `SessionService`

```ts
interface SessionService {
  /** Révoque une session (logout ciblé). Idempotent : révoquer une session déjà révoquée = OK. */
  revoke(userId: string, refreshToken: string): Promise<void>;
  /** Révoque toutes les sessions de l'utilisateur (logout-all). */
  revokeAll(userId: string): Promise<void>;
  /** Liste les sessions actives (pour UI « mes sessions », optionnel MVP). */
  listActive(userId: string): Promise<ActiveSession[]>;
}
interface ActiveSession { id: string; device_id: string; ip: string; user_agent: string | null; created_at: Date; expires_at: Date }
```

**Erreurs métier** : `SessionNotFound` (401 `unauthorized`) — logout idempotent : revoquer deux fois le
même token = succès silencieux (contrat §7 : 204 les deux fois).

**Règles encapsulées** : `revoke` → `revoked_at = now` ; `revokeAll` → `revoked_at = now` sur toutes les
lignes actives ; événements `auth.session.revoked` (RF-LOG-05). La purge physique des refresh expirés
(> 30 j) est un job de nettoyage (hors flux critique, voir §8 D-CLEAN-1).

---

## 6. Contrat `ProfileService`

```ts
interface ProfileService {
  /** Complète le profil d'un compte PENDING_OTP (OTP REGISTER vérifié) et active le compte. */
  completeRegistration(input: CompleteRegistrationInput): Promise<RegistrationResult>;
}
interface CompleteRegistrationInput {
  user_id: string;
  full_name: string;            // 2–80 caractères
  role: UserRole;               // verrouillé à la création (D5)
  consents: Consents;           // cgv obligatoire
  category_id?: string;         // requis si PROFESSIONAL
  division_id?: string;         // requis si PROFESSIONAL
  locality_id?: string;         // requis si PROFESSIONAL
  delivery_zone?: string;       // requis si DELIVERY_PERSON
  delivery_means?: string;      // requis si DELIVERY_PERSON
  device?: DeviceInfo;
}
interface RegistrationResult { user: UserPublic; tokens: AuthTokens }  // première session
```

**Erreurs métier**
| Erreur | Mapping |
|---|---|
| `OtpNotVerified` | 403 `otp_not_verified` (user non vérifié ou vérification expirée) |
| `RoleMismatch` | 409 `state_conflict` (rôle incompatible avec l'état PENDING_OTP) |
| `ConsentRequired` | 422 `consent_required` (cgv) |
| `CategoryRequired` / `LocalityRequired` / `ZoneRequired` | 422 `validation_failed` (détail par champ) |
| `PhoneAlreadyActive` | 409 `phone_already_registered` (course : compte devenu ACTIVE entre-temps) |

**Règles encapsulées (D5)** : transition `PENDING_OTP → ACTIVE` **transactionnelle** (typeorm
`transaction` + `FOR UPDATE` sur la ligne user pour éviter la course), `otp_verified_at` posé,
consentements persistés (consent versionné — port du module `users`), profil PRO/Livreur
`verification_status = UNVERIFIED`, puis `TokenService.issueAccess + issueRefresh`.

---

## 7. Événements de domaine (trace, `EventPublisherPort`)

| Événement | Émis par | Payload minimal |
|---|---|---|
| `auth.user.registered` | ProfileService | `{ user_id, role, country_code, phone, ts }` |
| `auth.user.logged_in` | TokenService (LOGIN) | `{ user_id, device_id, ip, ts }` |
| `auth.user.locked` | OtpService (D1) | `{ phone, reason: 'otp_send_limit', ts }` |
| `auth.session.revoked` | SessionService | `{ user_id, session_id, reason: 'logout'\|'logout_all'\|'reuse_detected', ts }` |
| `auth.otp.attempt_failed` | OtpService | `{ phone, purpose, attempts_left, ts }` |

> Les événements sont émis **après** commit (outbox P3 ; au MVP, émission synchrone via
> `EventEmitter` — pas de garantie de livraison en dehors des logs, décision D-EVT-1 §8).

---

## 8. Décisions d'architecture prises ici (à confirmer à l'implémentation)

| ID | Décision | Justification |
|---|---|---|
| D-PORT-1 | `UserRepositoryPort` satisfait par l'adaptateur TypeORM du module `users` (jointure de schéma directe, monolithe modulaire ADR-001) — pas de duplication de tables. | Évite de copier `users.users` ; le module `auth` reste découplé via l'interface. |
| D-STORE-1 | État chaud OTP en **Redis** (TTL 300 s, compteurs cooldown/fenêtre/verrouillage) ; `authz.otp_codes` = **trace d'audit** uniquement (ADR-004). Le lock canal (15 min) vit en Redis (`phone_locked`), pas en base. | ADR-004 ; évite des migrations sur les compteurs. |
| D-CLEAN-1 | Job de nettoyage (cron, lot 6.3+) : purge `PENDING_OTP` > 24 h et refresh expirés/révoqués > 90 j. | Spécifié ici pour ne pas oublier le cycle de vie (D3). |
| D-EVT-1 | Événements émis de façon synchrone au MVP (EventEmitter), passage Outbox en phase 2 (ADR-002). | Pas d'infra message broker au MVP ; l'interface `EventPublisherPort` permet la bascule. |

---

## 9. Contrats → ordre (rappel)

1. ~~Alignement docs~~ ✅ (`9660894`)
2. ~~Contrats API~~ ✅ (`fc62759`)
3. **Services métier (ce document)** — à valider
4. Tests (Gherkin/xUnit dérivés de la spec §3–§8) — prochain livrable
5. Implémentation (controllers → use-cases → adaptateurs), sans déviation

> Règle : toute évolution d'interface = mise à jour de ce doc (+ contrats API + spec) avant code.
