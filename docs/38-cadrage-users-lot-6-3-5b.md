# Cadrage contractuel — Sous-lot 6.3.5b : Vérification professionnelle (2 sous-lots)

> Livrable de cadrage (méthode bug.md) après **audit lecture seule validé** (structure
> à deux tables, stratégie de chiffrement infra+accès, découpage en 2 sous-lots).
> Périmètre : **dossier de vérification du professionnel** (CIN + selfie, justificatifs
> optionnels) — upload **présigné** vers le bucket **privé** (ADR-007), table
> `pros.verifications`, file de modération `admin.validation_tasks`, décision admin,
> **badge vérifié** (`verified`/`verified_at`) et `verification_level` recalculés.
> Aucun chiffrement applicatif des octets (stratégie infra+accès validée — voir §5).
> Sources : `06a-tables-mvp-core.md` L297-314 (`pros.profiles` statuts + `verified`),
> L426 (`pros.reputation.verification_level`), L454-470 (`pros.verifications`) ;
> `06b-blueprint-admin.md` §6 (`admin.validation_tasks`, dashboard unique) ;
> `19-business-rules.md` BR-010/011/012/013/014 (L36-41) + trust score (L193-194) ;
> `10-blueprint-backend.md` (VerificationService, modération) ; `15-securite.md`
> T04/A10 ; `12-api-blueprint.md` ; `02-adr.md` ADR-007 (R2/MinIO), ADR-008 (badge) ;
> `37` (socle media réutilisé : StoragePort bucket privé, purpose DOCUMENT).

---

## 1. Objectif et périmètre

- Le professionnel **soumet son dossier de vérification** : CIN (obligatoire) + selfie
  (obligatoire) puis, optionnellement, un justificatif d'activité (RC/attestation) et des
  diplômes (BR-011). Documents uploadés par **URL présignée** vers le bucket **privé**.
- L'**admin** modère la file (`admin.validation_tasks`), décide **approuver/rejeter**
  avec motif obligatoire au rejet (BR-012), consulte les documents via URLs **GET
  présignées** (`presignRead`).
- **Badge vérifié** (ADR-008) : `pros.profiles.verified = true` + `verified_at` une fois
  `verification_level ≥ 2` (CIN + selfie approuvés, BR-010). `verification_level`
  (0..3) recalculé dans la transaction de décision. Révocation possible (BR-014).
- **Hors périmètre 6.3.5b** (verrous bug.md/audit) : chiffrement applicatif des octets
  (stratégie infra validée, lot ultérieur si exigence T04 littérale) ; outbox
  `audit.events` (phase 2 confirmée — événements MVP synchrones, pattern 6.3.4) ;
  TOTP/2FA admin ; endpoints `GET /professionals/:id` publics (FCT-007) ; travailleur
  `admin.validation_tasks` générique (REVIEW/DISPUTE/REPORT) ; trust score +0.20
  (lot réputation) — seule la **dérivation** `verification_level`/badge est ici.

## 2. Découpage (validé)

| Sous-lot | Contenu | Références |
|---|---|---|
| **6.3.5b-1** | Dossier pro & documents privés : migration `pros.verifications`, presign `DOCUMENT` (bucket privé, pdf, 10 Mo), soumission `POST/GET /me/verifications`, événement `pros.verification.submitted` | RF-VR-01..07, §3.1-3.2 |
| **6.3.5b-2** | Administration & badge : `AdminGuard`, `GET /admin/verifications`, `PUT /admin/verifications/:id/decide`, `presignRead` (StoragePort), recompute `verification_level` + badge, révocation BR-014, événements `approved/rejected` + `admin.verification.decided` | RF-VR-08..12, §3.3 |

## 3. Règles fonctionnelles (verrouillées)

| ID | Règle |
|---|---|
| RF-VR-01 | **`POST /media/presign`** étendu : purpose **`DOCUMENT`** ajouté à la whitelist. MIME autorisés (whitelist DOCUMENT, sinon 422 `media_type_not_supported`) : `image/jpeg`, `image/png`, `image/webp`, **`application/pdf`** (ext `pdf`, `media_type='DOCUMENT'`). Images → `IMAGE`. Taille max **10 Mo** (422 `media_size_exceeded`). **Bucket `private`** (clé toujours `{country}/PROFESSIONAL/{profile_id}/{uuid}.{ext}`). URL enregistrée dans `media.files.url` = `s3://private/{key}` (jamais publique, non rendue). |
| RF-VR-02 | **Types de documents** (docs/06a) : `NATIONAL_ID` (CIN, obligatoire), `SELFIE` (obligatoire), `PRO_DOCUMENT` (justificatif d'activité, optionnel), `DIPLOMA` (optionnel). `NATIONAL_ID`/`SELFIE` : **au plus 1 ligne active** par type ; `PRO_DOCUMENT`/`DIPLOMA` : plusieurs autorisés. |
| RF-VR-03 | **`POST /professionals/me/verifications`** `{ items: [{ type, media_id }] }` : chaque `media_id` doit appartenir au pro, `purpose='DOCUMENT'`, `status='READY'` (HEAD S3 vérifié au préalable : absent → 410 `media_not_uploaded`, taille réelle > 10 Mo → 422 `media_invalid` + ligne `FAILED`), **non déjà référencé** par une autre ligne de vérification (422 `document_already_used`). Ligne `PROCESSING` → `READY` dans la même transaction. |
| RF-VR-04 | **Transitions** : soumission → ligne `PENDING` (média `READY`). `NATIONAL_ID`/`SELFIE` : si une ligne **PENDING** existe déjà pour le type → 409 `verification_pending` ; si **APPROVED** → 409 `verification_already_approved` ; si **REJECTED** → réactivation (nouveau `media_id`, `note`/`reviewed_*` remis à NULL, `status='PENDING'`) — droit de resoumettre (BR-012). `PRO_DOCUMENT`/`DIPLOMA` : toujours une nouvelle ligne (historique conservé). |
| RF-VR-05 | **File de modération** : à chaque soumission, **1 ligne `admin.validation_tasks`** (`entity_type='PRO_VERIFICATION'`, `entity_id=<id ligne>`, `status='PENDING'`) créée dans la même transaction. Une ligne de vérification = une tâche (réactivation = la tâche repasse `PENDING`, `decided_*` remis à NULL). |
| RF-VR-06 | **`GET /professionals/me/verification`** : état du dossier du pro — `{ status, verification_level, items: [{ id, type, media_id, mime_type, status, note, created_at }] }`. `status` global = `PENDING` si une ligne `PENDING` existe, `REJECTED` si une ligne obligatoire est rejetée (sinon `APPROVED`). Non-dévoilement : jamais les `s3_key`/URLs. |
| RF-VR-07 | **Événement** : soumission → `pros.verification.submitted` (après commit, pattern 6.3.4). Désormais dans le contrat d'événements (docs/10). |
| RF-VR-08 | **`AdminGuard`** : authentifie via `AuthGuard`, puis **relit le rôle en DB** (`users.user_roles.role='ADMIN'` — le claim JWT peut être obsolète). Sinon **403 `forbidden`**. Posé sur tout le controller admin. |
| RF-VR-09 | **`GET /admin/verifications?status=PENDING&page=1&limit=50`** : file paginée (offset, `limit` 1..100) triée `created_at ASC`. Item : `{ id, professional_id, business_name, type, media_id, mime_type, status, note, created_at, documents: [{ type, media_id, mime_type, url }] }` où `url` = **URL GET présignée** (`presignRead`, TTL 900 s) — l'admin consulte les documents avant de décider. `status` filtre `PENDING`/`APPROVED`/`REJECTED` (défaut `PENDING`). |
| RF-VR-10 | **`PUT /admin/verifications/:id/decide`** `{ approve: true\|false, reason?: string }` : **motif obligatoire au rejet** (422 `missing_reason`) ; ligne non `PENDING` → 409 `verification_pending` (sauf **révocation**, voir RF-VR-12) ; inconnue → 404 `verification_not_found`. Passe la ligne `APPROVED`/`REJECTED` (`reviewed_by`, `reviewed_at`, `note`) + la tâche admin `COMPLETED` (`decided_by`, `decided_at`, `note`) **dans la même transaction**. Réponse 200 = projection du dossier (`GET /professionals/me/verification` shape pro). |
| RF-VR-11 | **Recompute (transactionnel)** : `verification_level` = `0` rien · `1` NATIONAL_ID approuvé · `2` + SELFIE approuvé · `3` + au moins un `PRO_DOCUMENT` **ou** `DIPLOMA` approuvé (BR-010/011). Badge : `verified=true` + `verified_at=now()` si `level ≥ 2` ; si `level < 2` et `verified` → `verified=false`, `verified_at=null` (révocation, BR-014). Écrits sur `pros.profiles` + `pros.reputation.verification_level` (upsert si ligne absente). Événements : `pros.verification.approved` / `pros.verification.rejected` + `admin.verification.decided` (après commit). |
| RF-VR-12 | **Révocation (BR-014)** : une décision `approve:false` sur une ligne **APPROVED** révoque le document : ligne → `REJECTED` (nouvelle décision tracée), recompute appliqué (badge retiré si `level < 2`), événements rejet/publiés. Une ligne **REJECTED** ne peut pas être re-décidée (409 `verification_pending`) — le pro resoumet (RF-VR-04). |

## 4. Contrat API

Préfixe global `/api/v1` ; `Authorization: Bearer <access_token>` sur tout endpoint.

### 4.1 `POST /api/v1/media/presign` — extension purpose `DOCUMENT`

**Body**
```json
{ "purpose": "DOCUMENT", "mime_type": "application/pdf", "size_bytes": 240000 }
```
**201** → `{ "media_id": "<uuid>", "upload_url": "https://…", "s3_key": "BJ/PROFESSIONAL/<profile_id>/<uuid>.pdf", "expires_in": 900 }`
**Erreurs** : mêmes que 37 §3.1 + `422 media_size_exceeded` (> 10 Mo documents).

### 4.2 Dossier pro (module professionals)

| Méthode | Chemin | Body | Succès | Erreurs |
|---|---|---|---|---|
| POST | `/professionals/me/verifications` | `{ "items": [{ "type": "NATIONAL_ID", "media_id": "<uuid>" }] }` | **201** `{ "verifications": [{ "id": "<uuid>", "type": "NATIONAL_ID", "status": "PENDING", "created_at": "<iso>" }] }` (1 entrée par item) | 401 · 403 `account_locked` · 404 pro · 404 `media_not_found` · 410 `media_not_uploaded` · 422 `media_invalid` · 422 `verification_type_not_supported` · 422 `document_already_used` · 409 `verification_pending` · 409 `verification_already_approved` · 400 `validation_failed` |
| GET | `/professionals/me/verification` | — | 200 projection (RF-VR-06) | 401 · 404 pro |

### 4.3 Administration (module admin, `AdminGuard`)

| Méthode | Chemin | Body | Succès | Erreurs |
|---|---|---|---|---|
| GET | `/admin/verifications?status=PENDING&page=1&limit=50` | — | 200 `{ items, page, limit, total }` | 401 · **403 `forbidden`** |
| PUT | `/admin/verifications/:id/decide` | `{ "approve": true, "reason"?: "CIN conforme" }` | 200 projection (shape 4.2 GET) | 401 · 403 · 404 `verification_not_found` · 409 `verification_pending` · 422 `missing_reason` · 400 `validation_failed` |

## 5. Architecture (verrouillée)

- **Migration** `003_pros_verifications.ts` (pattern 001, idempotente, ADR-011) :
  ```sql
  CREATE TABLE pros.verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    professional_id UUID NOT NULL REFERENCES pros.profiles(id),
    type VARCHAR(24) NOT NULL,            -- NATIONAL_ID | SELFIE | PRO_DOCUMENT | DIPLOMA
    media_id UUID NOT NULL REFERENCES media.files(id),
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING', -- PENDING | APPROVED | REJECTED
    reviewed_by UUID REFERENCES users.users(id),
    reviewed_at TIMESTAMPTZ,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX idx_verifications_status ON pros.verifications(status);
  CREATE INDEX idx_verifications_pro ON pros.verifications(professional_id, status);
  ```
  Aucun changement sur `admin.validation_tasks` (déjà en 001) ni `pros.profiles`/`reputation`.
- **`StoragePort`** étendu (additif, 6.3.5b-2) : `presignRead({ key, bucket }) → { url, expiresIn }`
  (GET signé `GetObjectCommand`, TTL 900 s). Bucket privé sélectionné par le **service**
  selon le purpose (`DOCUMENT` → `private`, sinon `public`) — port inchangé sinon.
- **Module media** : `ALLOWED_PURPOSES` += `DOCUMENT` ; whitelist MIME DOCUMENT + pdf ;
  taille 10 Mo ; bucket privé au presign/HEAD/delete selon purpose ; `markReady(userId,
  mediaId)` (PROCESSING → READY) pour les documents ; URL `s3://private/{key}` pour les
  privés. `MediaStorageConfig`/adapter S3 inchangés.
- **Module professionals** : `ProfessionalVerificationService` (submit, getStatus) +
  `ProfessionalVerificationRepositoryPort` (TypeOrm, SQL brut pattern 6.3.5a) ;
  réutilisation des gardes `assertWritable` (404/403) et du publisher d'événements.
  La soumission lit la ligne media (ownership/purpose DOCUMENT), HEAD via
  `MediaFileService`, `markReady`, insère `pros.verifications` **+** `admin.validation_tasks`
  (entité `ValidationTask` importée du module admin) dans une transaction.
- **Module admin** (6.3.5b-2) : `AdminGuard` (AuthGuard + relecture `users.user_roles`),
  `AdminVerificationService` (list avec presignRead, decide + recompute),
  `AdminVerificationRepositoryPort` (lecture vérifications + écritures pros/reputation).
  AdminModule importe ProfessionalsModule (ports), MediaModule (StoragePort), AuthModule
  (AuthGuard/TokenService). Aucun cycle (professionals n'importe jamais admin).
- **Entité** `ProsVerification` dans `modules/professionals/domain/entities/` (miroir 001).

## 6. Sécurité

- **Stratégie infra+accès** (validée) : bucket privé strict + URLs présignées courtes
  (900 s) + **zéro PII dans les métadonnées** (aucun numéro CIN, clé uuid) ; chiffrement
  au repos assuré par l'infra (R2 côté Cloudflare ; MinIO dev : SSE-S3 sur
  `tchatcha-private`). Aucun transit des octets par le backend (ADR-007).
- `DOCUMENT` : jamais exposé publiquement (URL `s3://…` stockée, non rendue ; fiche
  publique hors périmètre) ; consultation admin **uniquement** par GET présigné.
- Ownership et non-dévoilement sur chaque `media_id` (404 cross-pro, pattern 6.3.5a) ;
  anti-réutilisation d'un document entre lignes (422 `document_already_used`).
- Admin : `AdminGuard` **relit le rôle en DB** (pas de confiance au claim) ; chaque
  décision tracée (`reviewed_by`/`decided_by`/`note`) + événements d'audit.
- Motif de rejet obligatoire (BR-012) ; pas de retour de `s3_key`/URLs au pro.

## 7. Tests (cibles)

**Unitaires** : MediaFileService (purpose DOCUMENT → bucket privé, pdf accepté, 10 Mo,
whitelist, `markReady`) · ProfessionalVerificationService (ownership, 409 pending/approved,
réactivation REJECTED, types, `document_already_used`, événements) · recompute
(0/1/2/3, badge posé/retiré, upsert reputation) · AdminVerificationService (guard rôle
DB, list paginée, decide motif obligatoire, révocation) · StoragePort fake (`presignRead`).

**E2E** (`me-verification.e2e-spec.ts`, `admin-verifications.e2e-spec.ts`, téléphones
`660402*`, pattern 6.3.5a) : V1 presign DOCUMENT → 201 + bucket privé (assertion
`lastPresignInput`); V2 pdf accepté / mime interdit 422 / > 10 Mo 422 ; V3 soumission
sans PUT → 410 ; V4 soumission → 201 + ligne PENDING + tâche admin créée ; V5 doublon
PENDING → 409 ; V6 doublon APPROVED → 409 ; V7 réactivation après REJECTED ; V8
document d'un autre pro → 404 ; V9 GET dossier → projection ; V10 non-PRO → 404 ;
A1 admin non-ADMIN → 403 ; A2 file vide → 200 `{items:[],total:0}` ; A3 file paginée ;
A4 decide approve → 200 + badge `verified` + `verification_level=2` + événements ;
A5 decide reject sans motif → 422 ; A6 decide reject → 200 + motif + rejet ; A7
révocation d'un APPROVED (badge retiré) ; A8 decide sur REJECTED → 409.

## 8. Livrables

- Cadrage (ce fichier) · migration `003` · entité `ProsVerification` + ports/adapters ·
  extension presign DOCUMENT (media) · `ProfessionalVerificationService` + DTOs ·
  `AdminGuard` + `AdminVerificationService` + DTOs · extension `StoragePort` (presignRead,
  adapter S3 + fakes) · événements · tests unitaires + e2e · lint/build verts · commit
  + push develop (un commit par sous-lot).

## 9. Addendum d'implémentation 6.3.5b-2

- `pros.verifications` demeure la source métier ; `admin.validation_tasks` est une file générique.
- `AdminGuard` compose `AuthGuard` puis relit le rôle `ADMIN` via `UserRepositoryPort`.
- `StoragePortToken` et `UserRepositoryPortToken` sont exportés par leurs modules propriétaires.
- Le recalcul transactionnel utilise un UPSERT de `pros.reputation` si l'agrégat est absent.
- Les événements de décision sont publiés après le retour réussi de la transaction.
- Les tests E2E administratifs A1–A8 utilisent exclusivement la plage `660403*`.
