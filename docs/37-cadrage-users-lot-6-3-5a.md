# Cadrage contractuel — Sous-lot 6.3.5a : Portfolio & Media (`POST /media/presign` + gestion portfolio pro)

> Livrable de cadrage (méthode bug.md) avant implémentation.
> Périmètre : **médias de portfolio** du professionnel authentifié — upload **présigné**
> (pas de transit de fichier par le backend, ADR-007), stockage dans `media.files`,
> commandes portfolio (confirmer, réordonner, marquer avant/après, supprimer), listing paginé.
> Sources : `12-api-blueprint.md` L179 (presign `POST /media/presign` → PUT S3/R2), L181
> (limites fichiers), L209 (FCT-021/022 `…/portfolio`) ; `02-adr.md` ADR-007 (S3-compatible :
> R2 prod, MinIO dev) ; `06d-revue-schema.md` §5 (`media.files`, clé S3) ; `06a` §4.7
> (`pros.portfolio_items` supprimé → `media.files`) ; `10-blueprint-backend.md` MOD-03
> (`ManagePortfolio`, `MediaStoragePort` upload signé) ; `15-securite.md` T04/A10 ;
> `35`/`36` (renvoi « portfolio upload presigné (6.3.5) ») ; `36` (pattern écritures vitrine :
> version optimiste RF-PW-W04b, projection complète RF-PW-W10, erreurs module professionals).

---

## 1. Objectif et périmètre

- US-053/054 (07g) : le professionnel enrichit sa fiche vitrine avec des **photos/vidéos
  portfolio** (métier, réalisations) et des paires **avant/après**.
- Le professionnel connecté **écrit** son portfolio : demande d'upload présigné, confirmation
  d'un média, réordonnancement, marquage `BEFORE_AFTER`, suppression. Lecture publique
  (fiche `GET /professionals/:id`) hors périmètre (FCT-007, lot ultérieur) ; la vitrine
  propriétaire continue de l'exposer via `GET /professionals/me` (6.3.3, inchangé).
- **Hors périmètre 6.3.5a** (verrous bug.md) : **aucun chiffrement CIN**, aucune table
  `pros.verifications`/`pros.certifications`, **aucun endpoint admin**, aucun workflow de
  vérification, aucun justificatif. La divergence `pros.verifications` **vs**
  `admin.validation_tasks` n'est **pas tranchée ici** (audit dédié 6.3.5b : modèle de
  données, administration, audit de sécurité). L'infrastructure Storage est seulement
  **conçue** pour être réutilisée par 6.3.5b (bucket privé + purpose `DOCUMENT` non
  activés, port générique).

## 2. Règles fonctionnelles (verrouillées)

| ID | Règle |
|---|---|
| RF-MD-01 | **`POST /media/presign`** (module media, générique) : authentifié (AuthGuard), demande une URL d'upload **présignée PUT** vers le bucket **public** (`S3_BUCKET_PUBLIC`). Body : `purpose` (`PORTFOLIO` ou `BEFORE_AFTER` — whitelist 6.3.5a), `mime_type`, `size_bytes` (obligatoire, > 0), `width?`, `height?`, `duration_sec?`. Le serveur **ne reçoit jamais le fichier** (ADR-007). |
| RF-MD-02 | **MIME autorisés** (whitelist stricte, sinon 422 `media_type_not_supported`) : `image/jpeg`, `image/png`, `image/webp`, `video/mp4`, `video/quicktime`, `video/webm`. `media_type` dérivé : `IMAGE` (image/*) / `VIDEO` (video/*). Extension de clé dérivée du MIME : `jpg`/`png`/`webp`/`mp4`/`mov`/`webm`. La signature PUT embarque le `Content-Type` déclaré → toute incohérence au PUT est rejetée par S3. |
| RF-MD-03 | **Tailles maximales** (12-api L181) : 20 Mo pour une image, 100 Mo pour une vidéo, sinon 422 `media_size_exceeded`. Vérifiée **au presign** (déclaration `size_bytes`) **et au confirm** (HEAD S3 : `Content-Length` réel ≤ max, sinon `FAILED` + 422 `media_invalid`). |
| RF-MD-04 | **URLs présignées courtes** (15-securite T04) : `S3_PRESIGN_TTL_SECONDS` (défaut **900 s = 15 min**). Réponse : `upload_url`, `media_id`, `s3_key`, `expires_in`. Une fois expirée : le client redemande un presign (nouvelle ligne PROCESSING, la précédente sera purgée). |
| RF-MD-05 | **Clé S3** (06d §5) : `{country}/{owner_type}/{owner_id}/{uuid}.{ext}` — `country` = `pros.profiles.country_code`, `owner_type` = `PROFESSIONAL`, `owner_id` = **id du profil pro** (`pros.profiles.id`, même référence que le reader 6.3.3), `uuid` v4. |
| RF-MD-06 | **Statuts `media.files`** : le presign crée la ligne en **`PROCESSING`** (invisible dans la vitrine, n'appartient pas à la version). Le confirm vérifie l'objet (HEAD) puis passe **`READY`** (visible) ou **`FAILED`** (objet absent → 410 `media_not_uploaded` ; taille réelle > max → 422 `media_invalid` + ligne `FAILED`). |
| RF-MD-07 | **Purge des orphelins** : à chaque presign, le serveur purge les lignes `PROCESSING` du même pro créées **il y a > 24 h** (suppression ligne + `deleteObject` S3, qui ignore les 404). Aucun job/worker au MVP. |
| RF-MD-08 | **Anti-spam** : **max 50 lignes `PROCESSING` en attente** par pro, sinon 422 `media_limit_exceeded`. Aucun quota métier sur les `READY` (portfolio « illimité » — protections techniques seulement : pagination, tailles, MIME, TTL). |
| RF-PW-P01 | **`POST /professionals/me/portfolio/:id/confirm`** : confirme un média `PROCESSING` du pro (HEAD S3). Succès → `READY`, **incrément de `version`** (RF-PW-W04b) + événement `pros.profile.updated` (pattern 6.3.4, après commit), réponse = **projection complète `ProfessionalMeResponse`** (RF-PW-W10). |
| RF-PW-P02 | **`PUT /professionals/me/portfolio/:id`** : met à jour un média `READY` du pro : `sort_order` (int ≥ 0) et/ou `purpose` (`PORTFOLIO`/`BEFORE_AFTER`). **Réordonnancement relatif** : le nouvel index déplace l'item, les autres sont re-numérotés pour une séquence contiguë (0..n-1) dans la même transaction. Porte `version`, incrément + événement + projection (RF-PW-W04b/W10/W11). |
| RF-PW-P03 | **`DELETE /professionals/me/portfolio/:id`** : suppression **douce** (`deleted_at`) de la ligne **+ `deleteObject` S3** (le serveur possède la clé). Porte `version`, incrément + événement + projection. La ligne `READY` est immédiatement retirée de la vitrine. |
| RF-PW-P04 | **`GET /professionals/me/portfolio`** : liste paginée des médias `READY` du pro (`status = 'READY'`, `deleted_at IS NULL`, `purpose IN ('PORTFOLIO','BEFORE_AFTER')`), tri `sort_order ASC, created_at ASC` (ordre stable = tri de la fiche). Pagination **offset** : `page` (≥ 1, défaut 1), `limit` (1..100, défaut 50). Réponse : `{ items, page, limit, total }`. Champs item (identiques au reader 6.3.3) : `id`, `url`, `media_type`, `purpose`, `width`, `height`, `sort_order`, `mime_type`, `size_bytes`, `duration_sec`, `created_at`. |
| RF-PW-P05 | **Ownership et non-dévoilement** : toute opération est scellée par le profil du pro (`owner_type = 'PROFESSIONAL'`, `owner_id = profile_id du user`). Un média d'un **autre** pro (ou inconnu) → **404 `media_not_found`** (règle de non-dévoilement, cohérente RF-PW02 : aucune fuite d'existence). |
| RF-PW-P06 | **Version (RF-PW-W04b étendue)** : les mutations **visibles** du portfolio (confirm, update, delete) portent `version` (lue via `GET /professionals/me`), échouent en **409 `version_conflict`** si obsolète, incrémentent `version` dans la même transaction. Le **presign** est préparatoire (ligne invisible) : **ne porte pas** de version, n'en incrémente pas. |
| RF-PW-P07 | **Profil requis** : 404 `professional_not_found` pour tout utilisateur dont le rôle ≠ `PROFESSIONAL` ou sans fiche (mêmes gardes que 6.3.4, RF-PW-W02). Comptes BANNED/SUSPENDED → 403 `account_locked` ; fiche DRAFT/PENDING_VERIFICATION/ACTIVE → portfolio autorisé (BR-013). |

## 3. Contrat API

Préfixe global `/api/v1` ; `Authorization: Bearer <access_token>` sur tout endpoint.

### 3.1 `POST /api/v1/media/presign` — demande d'upload présigné

**Body**
```json
{
  "purpose": "PORTFOLIO",            // PORTFOLIO | BEFORE_AFTER
  "mime_type": "image/jpeg",
  "size_bytes": 350000,
  "width": 1280, "height": 960,      // optionnels (images)
  "duration_sec": null               // optionnel (vidéos)
}
```

**201** → `{ "media_id": "<uuid>", "upload_url": "https://…presigned…", "s3_key": "BJ/PROFESSIONAL/<profile_id>/<uuid>.jpg", "expires_in": 900 }`
- Le client PUT le fichier vers `upload_url` avec **exactement le même `Content-Type`**.

**Erreurs** : `401 unauthorized` · `404 professional_not_found` · `403 account_locked` · `422 media_type_not_supported` (MIME) · `422 media_size_exceeded` · `422 media_purpose_not_supported` · `422 media_limit_exceeded` · `400 validation_failed` (format).

### 3.2 Commandes portfolio (module professionals)

| Méthode | Chemin | Body | Succès | Erreurs |
|---|---|---|---|---|
| POST | `/professionals/me/portfolio/:id/confirm` | `{ "version": 3 }` | 200 + `ProfessionalMeResponse` | 404 pro · 404 `media_not_found` · 409 `version_conflict` · 410 `media_not_uploaded` · 422 `media_invalid` |
| PUT | `/professionals/me/portfolio/:id` | `{ "version": 3, "sort_order"?: 2, "purpose"?: "BEFORE_AFTER" }` | 200 + `ProfessionalMeResponse` | idem + 422 `portfolio_update_invalid` (purpose/sort_order invalides) |
| DELETE | `/professionals/me/portfolio/:id` | `{ "version": 3 }` | 200 + `ProfessionalMeResponse` | idem (404 si déjà supprimé) |
| GET | `/professionals/me/portfolio?page=1&limit=50` | — | 200 `{ items, page, limit, total }` | 404 pro |

`ProfessionalMeResponse` = projection inchangée de 6.3.3/6.3.4 (`version` à jour, `portfolio` inclus, RF-PW-W10). Aucune commande portfolio ne répond 204.

## 4. Architecture (verrouillée)

- **`StoragePort`** (module media, domaine) — indépendant du provider, prêt pour 6.3.5b :
  `presignUpload({ key, contentType, sizeBytes, bucket }) → { url, expiresIn }` ;
  `headObject({ key, bucket }) → { sizeBytes, contentType } | null` ;
  `deleteObject({ key, bucket }) → void`. Buckets par usage : `public` (portfolio/avatar) /
  `private` (CIN/docs — **réservé 6.3.5b**, non activé).
- **`S3StorageAdapter`** (`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`) :
  `forcePathStyle` + `endpoint` custom (MinIO dev), identique protocole S3 pour R2 prod
  (ADR-007). Signature `PutObjectCommand` avec `ContentType` exact ; `HeadObjectCommand`,
  `DeleteObjectCommand` (404 ignoré).
- **Config S3 complète et validée** (extension de `env.validation.ts` — actuellement
  `whitelist:true` **strippe** `S3_REGION`/`S3_BUCKET_*`/`S3_FORCE_PATH_STYLE`, piège audité
  à corriger en premier) : `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`,
  `S3_SECRET_ACCESS_KEY`, `S3_BUCKET_PUBLIC`, `S3_BUCKET_PRIVATE`,
  `S3_FORCE_PATH_STYLE`, **nouveau** `S3_PRESIGN_TTL_SECONDS` (défaut 900),
  **nouveau** `S3_PUBLIC_URL_BASE` (URL publique du bucket : MinIO
  `{endpoint}/{bucket}`, R2 domaine CDN ; stockée dans `media.files.url` dès la
  création de la ligne). Variables **optionnelles avec défauts dev** (MinIO local) ;
  bucket absent → erreur runtime au presign (pas de blocage au boot). `.env.example` mis à jour.
- **`MediaFileService`** (media/application) : presign (validations MIME/taille/purpose →
  purge → limite → clé → ligne `PROCESSING` → presign), confirm (HEAD → `READY`/`FAILED`),
  `deleteObject`, passage de la référence d'item. **Sans règles vitrine** (version/événement
  = module professionals).
- **`MediaFileRepository`** (media/infrastructure, TypeORM) : createPending, confirmReady,
  markFailed, softDelete, listByOwner (pagined), findOwned, purgeStale.
- **Module professionals** : `ProfessionalShowcaseService` étendu (confirm/update/delete/list
  portfolio) — bump `version` + événement `pros.profile.updated` réutilisés (pattern 6.3.4),
  projection complète réutilisée.
- **E2E** : `TestStorageModule` fournissant un **double en mémoire** de `StoragePort`
  (comme `TestDatabaseModule`/`TestSmsSpy`) — URL factice, HEAD simulé, `deleteObject`
  mémoire. Aucun réseau S3 pendant les tests e2e ; l'adaptateur S3 réel est couvert en
  **tests unitaires** (signature locale, forme/TTL de l'URL) ; intégration MinIO réelle =
  tests d'intégration testcontainers (13-strategie-tests L24, lot CI ultérieur).

## 5. Sécurité

- Présign seul canal d'upload ; le backend ne voit jamais les octets (ADR-007, A10 SSRF :
  jamais d'URL client vers serveur).
- TTL court (900 s), clé non devinable (uuid v4), ownership vérifié sur chaque opération
  (404 non-dévoilant cross-pro).
- MIME whitelist stricte + taille maximale signée/revérifiée au HEAD.
- Aucune donnée personnelle : média portfolio **public** ; le bucket privé et le
  chiffrement (CIN) sont **explicitement hors périmètre** (6.3.5b).

## 6. Tests (cibles)

**Unitaires** (module media + professionals) : validation config S3 (défauts, buckets
manquants, TTL) · adapter S3 (forme URL présignée, présence `X-Amz-Expires`/`X-Amz-Content-Sha256`,
TTL) · MediaFileService (MIME/taille/purpose rejetés, limite 50, purge > 24 h, clé S3,
transitions PROCESSING→READY/FAILED, HEAD absent → 410) · PortfolioService (ownership
404, version obsolète 409, bump version, reorder contigu, delete = soft + objet).

**E2E** (`me-portfolio.e2e-spec.ts`, pattern 6.3.4) : P1 presign 201 + structure réponse ;
P2 MIME interdit 422 ; P3 taille > max 422 ; P4 purpose interdit 422 ; P5 confirm sans PUT
→ 410 ; P6 confirm → 200 READY visible dans la vitrine + version incrémentée ; P7 confirm
version obsolète → 409 ; P8 reorder → séquence contiguë + version bump ; P9 marquage
BEFORE_AFTER ; P10 delete → soft + retiré de la vitrine + version bump ; P11 non-pro → 404 ;
P12 cross-pro → 404 ; P13 pagination (total/items/limit) ; P14 limite 50 PROCESSING → 422.

## 7. Livrables

- Cadrage (ce fichier) · `env.validation.ts` étendu + `.env.example` · dépendances
  `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` · module media (port, config,
  adapter, repository, service, controller) · commandes portfolio professionals +
  DTO · tests unitaires + e2e · lint/build verts · commit + push develop.
- **Migration : aucune** (`media.files` existe en 001).
