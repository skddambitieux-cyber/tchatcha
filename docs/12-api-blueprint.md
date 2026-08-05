# 4.3 — API Blueprint (REST — TCHATCHA)

Version : 1.0 — Étape 4. Contrat **complet** avant Swagger (généré à l'Étape 5).
Source de vérité front/back (10-blueprint-backend → endpoints ; 11 → consommation).

---

## 1. Principes REST

- **Ressources nommées au pluriel** : `/requests`, `/professionals`, `/quotes`.
- **Verbes HTTP** : GET (lecture), POST (création/action), PUT (remplacement), PATCH (partiel), DELETE (suppression).
- **Actions non-CRUD** : POST de sous-ressource (`/payments/initiate`) ou action explicite (`/bookings/:id/confirm`).
- **État du serveur uniquement** : pas de logique d'état côté client ; statut = propriété de la ressource.
- **Réponse 201 + header `Location`** à la création.
- **JSON uniquement** ; UTF-8 ; `application/json; charset=utf-8`.
- **Idempotence** : DELETE/PUT idempotents par nature ; POST critiques via `Idempotency-Key` (§9).
- **Toutes les dates** : ISO 8601 UTC (`2026-08-03T14:30:00Z`).

---

## 2. Versionnement

| Règle | Valeur |
|---|---|
| Version dans l'URL | `/api/v1/…` |
| Version actuelle | `v1` |
| Bascule | nouvelle version = nouveau chemin ; l'ancienne reste 6 mois |
| Dépréciation | header `Deprecation: true` + `Sunset: <date>` sur les vieux endpoints |
| Rupture | **jamais** sur v1 non dépréciée ; ajouts = évolution additive (champs optionnels) |
| Changement mineur | champ ajouté dans la réponse (non supprimé) — pas de nouvelle version |

---

## 3. Conventions de base

### 3.1 Enveloppe de pagination (toutes les listes)

```
GET /api/v1/professionals?lat=6.36&lon=2.42&radius_km=10&q=carreleur&sort=distance:asc&limit=20&cursor=eyJpZCI6…..

200 OK
{
  "data": [ … ],
  "pagination": {
    "next_cursor": "eyJpZCI6…",     // null si fin
    "has_more": true,
    "total_estimate": 342           // estimé (COUNT est coûteux), null si inconnu
  }
}
```

| Règle | Valeur |
|---|---|
| Type | **keyset (cursor)** par défaut — stable sous insertion |
| `limit` | défaut 20, max 100 |
| `cursor` | opaque (base64url du dernier id + valeurs de tri), jamais d'offset en production |
| Tri | `sort=field:asc|desc` (champs listés par ressource) |
| Ordre stable | tri composite `(champ, id)` pour la pagination |

### 3.2 Filtres

| Forme | Exemple |
|---|---|
| Égalité | `?status=OPEN` |
| Plage | `?price_min=10000&price_max=50000` |
| Multi-valeurs | `?categories=carrelage,plomberie` (virgule) |
| Booléen | `?verified=true` |
| Géospatial | `?lat=…&lon=…&radius_km=…` |

Filtres autorisés par ressource (whitelist stricte — jamais de passage de SQL).

### 3.3 Recherche

`?q=…` : recherche texte (plein texte + trigrammes, insensible accents — `06-schema-base.md`),
≤ 100 caractères, combinable avec filtres et tri. Autocomplétion : `GET /search/suggestions?q=…`.

---

## 4. Authentification & sécurité transport

| Règle | Valeur |
|---|---|
| Access token | `Authorization: Bearer <jwt>` — JWT RS256, 15 min |
| Refresh | `POST /api/v1/auth/refresh` `{refresh_token}` → rotation (famille, détection de vol) ; refresh JWT 30 j, stocké côté client uniquement |
| OTP | `POST /auth/otp/request` → SMS-001 ; `POST /auth/otp/verify` |
| Idempotency | header `Idempotency-Key` (UUID) sur POST critiques (paiement, publication, devis) |
| TLS | obligatoire ; HSTS ; refus des requêtes sans TLS en prod |
| CORS | whitelist origines admin/web ; apps mobiles non concernées |
| Headers de sécurité | `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security`, CSP (web admin) |
| Pays | header `X-Country-Code: BJ` ou dans le body DTO ; défaut déduit de la session |
| Langue | `Accept-Language: fr|en` (réponses localisées : messages d'erreur inclus) |

---

## 5. Erreurs (enveloppe unifiée)

Tout erreur (4xx/5xx) :

```
{
  "error": {
    "code": "slot_conflict",          // machine-readable, stable
    "message": "Ce créneau vient d'être réservé",   // localisé (Accept-Language)
    "details": [ { "field": "slot_start", "reason": "already_taken", "meta": {…} } ],
    "trace_id": "01J…",               // corrélé aux logs/traces
    "request_id": "req_…"
  }
}
```

| Code HTTP | Usage | Exemples de `code` |
|---|---|---|
| 400 | requête invalide | `invalid_query`, `malformed_json` |
| 401 | non authentifié / token invalide | `unauthorized`, `token_expired`, `otp_invalid`, `refresh_reused` |
| 402 | paiement requis | `payment_required` |
| 403 | permission refusée | `forbidden`, `not_verified`, `self_review_forbidden`, `consent_required` |
| 404 | introuvable | `request_not_found`, `professional_not_found` |
| 409 | conflit d'état | `illegal_transition`, `slot_conflict`, `review_already_exists`, `dispute_already_open`, `category_in_use` |
| 410 | ressource expirée/supprimée | `request_expired`, `quote_withdrawn` |
| 422 | échec validation | `validation_failed` (+ details par champ) |
| 423 | compte verrouillé | `account_locked` |
| 428 | périphérique non vérifié | `device_untrusted` |
| 429 | rate limit | `rate_limited` (header `Retry-After`) |
| 500 | erreur serveur | `internal_error` (jamais de stack trace exposée) |
| 503 | indisponible / dégradé | `service_unavailable`, `provider_unavailable` (Nomninatim, MoMo) |

Règle : les `details` de 422 suivent le schéma `{field, reason, meta}` pour un
affichage inline fiable côté mobile (11 §5).

---

## 6. Rate limiting

| Niveau | Règle | Endpoints |
|---|---|---|
| IP | 100 req/min | tous (proxy) |
| Compte | 300 req/min | authentifiés |
| OTP | 1 req / 45 s ; 5 essais / 15 min → verrouillage 15 min | `/auth/otp/*` |
| Chat | 30 msg/min | `/conversations/:id/messages` |
| Recherche | 60 req/min | `/search/*` |
| Login admin | 5 essais / 15 min + TOTP | `/admin/login` |

Réponse 429 avec `Retry-After` ; les dépassements sont audités (fraude — 15 §7).

---

## 7. Idempotence (critique : paiements, publications)

| Règle | Valeur |
|---|---|
| Header | `Idempotency-Key: <uuid>` sur `POST /payments/initiate`, `POST /requests`, `POST /requests/:id/quotes`, `POST /reviews` |
| Durée | clé conservée 24 h (cache Redis) |
| Comportement | même clé + même body → 200 avec la réponse d'origine (pas de doublon) |
| Clé différente | nouvelle opération |
| Conflit | même clé, body différent → 409 `idempotency_mismatch` |
| Expiration | au-delà de 24 h → clé réutilisable ; le client doit re-vérifier l'état |

---

## 8. Webhooks (paiements — adapter + futur externe)

| Règle | Valeur |
|---|---|
| Format | `POST <callback_url>` body signé |
| Signature | header `X-Tchatcha-Signature: sha256=HMAC(secret, body)` — secret par intégration |
| Réponse attendue | `200` (ou `2xx`) ; sinon retry avec backoff : 1 min, 5 min, 15 min, 1 h, 6 h, 24 h |
| Déduplication | `event_id` unique en base (`uq_webhook_events` — 06b) |
| Événements | `payment.succeeded`, `payment.failed`, `payment.refunded`, `payout.status_changed` |
| Livraison | via `notifications` module (consommateur Outbox) |
| En cas de panne | file persistante + tableau admin (SCR-127) |

---

## 9. Limites de payload

| Ressource | Limite |
|---|---|
| Corps de requête | 100 Ko (JSON) |
| Téléchargement | interdit via API : upload = presigned URL (POST `/media/presign` → PUT S3/R2) |
| Photos par entité | 10 (demande), 5 (preuves litige), 5 (avis), portfolio illimité |
| Fichier média | 20 Mo/photo, 100 Mo/vidéo (compressé côté client) |
| Pagination | `limit` ≤ 100 |
| Texte | titre 160, description 2000, commentaire avis 1000, message 2000 car. |

---

## 10. Récapitulatif des routes principales (v1 — détail par FCT dans 08)

| FCT | Endpoints |
|---|---|
| FCT-001/002 | `POST /auth/otp/request` · `POST /auth/otp/verify` · `POST /auth/register` · `POST /auth/refresh` · `POST /auth/logout` |
| FCT-003 | `GET /geo/countries` · `GET /geo/countries/:code/divisions` |
| FCT-004 | `GET /home/feed` |
| FCT-005/006 | `GET /search` · `GET /search/suggestions` · `GET /categories` |
| FCT-007 | `GET /professionals/:id` · `GET /professionals/:id/reviews` · `GET /professionals/:id/portfolio` · `POST /favorites` · `DELETE /favorites/:professionalId` |
| FCT-008 | `POST /requests` · `GET /requests/:id` |
| FCT-009 | `GET /requests` (match pro) · `POST /requests/:id/quotes` |
| FCT-010 | `POST /quotes/:id/counter-offers` |
| FCT-011 | `POST /quotes/:id/accept` · `POST /requests/:id/cancel` · `POST /requests/:id/reopen` |
| FCT-012 | `GET /professionals/:id/slots?from=&to=` · `POST /bookings` |
| FCT-013 | `POST /payments/initiate` · `POST /payments/verify` · `GET /payments/:id` · webhooks `POST /payments/webhook/:provider` |
| FCT-014 | `POST /bookings/:id/confirm` (client/pro) |
| FCT-015 | `POST /disputes` · `GET /disputes/:id` |
| FCT-016 | `POST /reviews` · `GET /professionals/:id/reviews` · `POST /reviews/:id/report` · `POST /reviews/:id/respond` |
| FCT-017 | `GET /conversations` · `POST /conversations` · `GET /conversations/:id/messages` · `POST /conversations/:id/messages` · ws `/ws/conversations/:id` |
| FCT-018 | `GET /notifications` · `POST /notifications/read` · `POST /devices` |
| FCT-019 | `POST /favorites` · `DELETE /favorites/:id` · `GET /favorites` |
| FCT-020 | `POST /professionals/me/verifications` · `GET /professionals/me/verification` · admin : `GET /admin/verifications` · `PUT /admin/verifications/:id/decide` |
| FCT-021/022 | `GET/PUT /professionals/me` · `POST/PUT/DELETE /professionals/me/services` · `…/portfolio` · `…/availability` · `POST …/coverage-areas` |
| FCT-023 | `GET /wallet` · `GET /wallet/transactions` · `POST /payouts` |
| FCT-024 | `GET /professionals/me/reputation` · `GET /professionals/me/stats` |
| FCT-025 | admin : `GET /admin/dashboard` · `GET /admin/verifications` · `GET /admin/moderation` · `GET /admin/reports` · `GET /admin/disputes` · `PUT /admin/disputes/:id/resolve` · `POST /admin/users/:id/suspend` · `GET /admin/stats` · `GET /admin/transactions` · `PUT /admin/config` |
| FCT-026 | `GET /me/export` · `POST /me/anonymize` · `DELETE /me` |

**Ce contrat est figé pour v1** : tout changement = PR sur `12-api-blueprint.md`
+ ADR si rupture + mise à jour de `08-specification-fonctionnelle.md` et `07l/11`.
