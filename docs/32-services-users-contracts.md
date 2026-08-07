# Services métier — Lot 6.3.1 : Profil (contrats d'interface)

> Livrable « Services métier » de l'ordre **Alignement docs → Contrats API → Services métier → Tests → Implémentation**.
> **Aucune implémentation.** Sources : `31-api-contracts-users.md` (contrats API figés),
> `30-spec-users-lot-6-3.md` (RF-ME-01…07), `28-services-auth-contracts.md` (port `UserRepositoryPort`,
> `ProfileService` existant), `06a-tables-mvp-core.md` (`users.users`, `users.user_roles`, `pros.profiles`).
> Convention : hexagone — le service métier ne dépend que d'interfaces (ports).

---

## 1. Périmètre

| Service | Responsabilité | Use-cases couverts |
|---|---|---|
| `ProfileService` | lecture du profil connecté, projection owner-aware | `GET /me` (6.3.1) |

Le service existe déjà (complète l'inscription `completeRegistration`, lot 6.2) — **on étend** l'interface
par une méthode de lecture `getMe(actorId)` sans toucher au contrat existant (compatibilité 6.2).

Hors périmètre 6.3.1 : modification, suppression RGPD, multi-rôles, notifications (lots ultérieurs).

---

## 2. Ports utilisés

| Port | Méthode utilisée | Fourni par |
|---|---|---|
| `UserRepositoryPort` | `findById(userId)` · `findRolesById(userId)` *(dérivé de `findRole`, liste)* | `TypeOrmUserRepository` (schéma `users`) |
| `ProfessionalProfileRepositoryPort` (adaptation locale) | `findByUserId(userId)` | adaptation `pros.profiles` (port du module `professionals` ; mapping local autorisé D-PORT-1) |
| `ClockPort` | `now()` (non requis pour la lecture pure, réservé émissions/événements) | `SystemClock` |

> Décision : l'écriture est nulle pour `/me` (lecture pure) → **aucun événement émis**, aucun `last_login_at`
> mis à jour (déjà fait au login). Ne pas écrire en lecture (idempotence, cache possible).

---

## 3. Contrat `ProfileService.getMe`

```ts
interface ProfileService {
  /** Lecture du profil du compte connecté (6.3.1). Ne modifie aucun état. */
  getMe(actorId: string): Promise<UserMe>;
}

interface UserMe {
  id: string;
  country_code: string;
  phone: string;
  email: string | null;
  full_name: string | null;      // null si profil PENDING_OTP (inscription inachevée)
  avatar_url: string | null;
  locale: string;
  status: UserStatus;
  otp_verified_at: string | null;  // ISO
  created_at: string;              // ISO
  roles: UserRole[];               // MVP : 0-1 élément
  professional: MeProfessional | null;  // si rôle PROFESSIONAL + profil pros existant
  deliverer: MeDeliverer | null;        // si rôle DELIVERER
}

interface MeProfessional {
  id: string;
  business_name: string | null;
  status: string;             // pros.profiles.status
  verification_status: string;
  rating_avg: number;
  rating_count: number;
  trust_score: number;
  completed_jobs: number;
  location_name: string | null;
}

interface MeDeliverer {
  zone: string | null;
  means: string | null;
}
```

**Comportement attendu**

| Condition | Comportement |
|---|---|
| user trouvé, `anonymized_at` null | **200** `UserMe` complet (31 §1 mapping) |
| user trouvé, `status = PENDING_OTP` (*) | **200** restreint : `{id, country_code, phone, status}` seulement, autres champs `null` (E-ME-06) |
| user `ACTIVE/SUSPENDED` sans profil pro mais rôle PROFESSIONAL | `professional = null` (pas d'erreur) |
| user `SUSPENDED` / `BANNED` | `AccountLockedError` → 403 |
| user `anonymized_at` posé | `AnonymizedError` → 403 `resource_unavailable` |
| user inexistant (sub inconnu) | `UserNotFound` → 401 `unauthorized` (pas de fuite) |

> (*) `PENDING_OTP` est un état transitoire : en pratique `GET /me` avec un JWT est issu d'un login
> (donc ACTIVE) ou d'un token de session non encore référencé. Le cas est couvert par défense en profondeur.

**Erreurs métier (mapping HTTP)**
| Erreur | Mapping |
|---|---|
| `UserNotFound` | 401 `unauthorized` |
| `AccountLocked` | 403 `account_locked` |
| `AccountAnonymized` | 403 `resource_unavailable` |

**Règles encapsulées**
- Lecture **read-only**, pas de verrou, pas d'écriture.
- Projection owner-only : `userId` vient du JWT (jamais d'un paramètre requête).
- Donnée `email` effacée si `anonymized_at` posé (mais ce cas retourne en fait 403 avant toute projection).
- Mapping `professional` est best-effort : vivier de `pros.profiles` absent → `null`.

---

## 4. Décisions d'architecture (à confirmer à l'implémentation)

| ID | Décision |
|---|---|
| D-ME-1 | La lecture vit dans `ProfileService` (module `auth`), **port en lecture supplémentaire** option partagée `users` ; pas de nouveau module cross-lot pour 1 endpoint. |
| D-ME-2 | Le mapping `pros.profiles` (`findByUserId`) est une **fonction optionnelle** du port `UserRepositoryPort` ou un port local `ProfessionalProfilePort` fourni par l'adaptateur du module `professionals` — décision au commit implémentation pour ne pas bloquer doc. |
| D-ME-3 | `GET /me` annoté `@UseGuards(AuthGuard)` + décorateur `@CurrentUser()` : l'artefact garde est **réutilisable** pour tous les endpoints 6.3+ (professionals/me, admin). |

---

## 5. Contrats → ordre (rappel)

1. ~~Alignement docs~~ ✅
2. ~~Contrats API~~ ✅ (`31-api-contracts-users.md`)
3. **Services métier (ce document)** — à valider
4. Tests (GWT/xUnit) — prochain livrable (`33-tests-users.md`)
5. Implémentation, sans déviation.

> Règle : toute évolution d'interface = mise à jour de ce doc + contrats API + spec avant code.