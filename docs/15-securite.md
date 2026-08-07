# 4.6 — Sécurité (TCHATCHA)

Version : 1.0 — Étape 4. Complète `09-nfr.md` (§4) et `12-api-blueprint.md` (§4-8).
Source : ADR-022 (audit/anti-bot), exigence §6 (traçabilité), PRD §21 (vérification).

---

## 1. Threat Model (STRIDE par composant)

### 1.1 Périmètre
Clients mobiles (Flutter), API (NestJS), PG/PostGIS, Redis, S3 (R2), FCM, SMS,
paiements (MoMo/Moov), admin web, médias.

### 1.2 Menaces identifiées → mitigations

| # | Menace (STRIDE) | Impact | Mitigation |
|---|---|---|---|
| T01 | **Spoofing** : usurpation compte (OTP intercepté, SIM swap) | élevé | OTP à usage unique + cooldown 45 s + vélocité ; détection nouveau device (NT-017) ; Paiements : OTP 2ᵉ facteur (SMS-002) |
| T02 | Tampering : modification devis/paiement | élevé | TLS 1.2+ ; signature webhooks HMAC ; idempotence ; verrouillage optimiste (version) |
| T03 | Repudiation : pro nie avoir accepté un devis | moyen | audit : `audit.aggregate_events` append-only + signatures d'événements (ajustement 1) |
| T04 | Information disclosure : CIN/téléphones | critique | chiffrement au repos (téléphone, CIN) ; presigned URLs courtes ; droits S3 ; jamais de PII dans les logs |
| T05 | DoS : flood recherche/OTP/chat | moyen | rate limiting 3 niveaux (12 §6) ; cache ; quotas ws |
| T06 | Elevation : client → admin, pro → client | critique | RBAC (2 §3), guards NestJS, tests négatifs e2e ; admin 2FA TOTP (SCR-120) |
| T07 | Fraude financière : faux compte, fausse prestation | élevé | vérification CIN+selfie avant badge ; gel paiement jusqu'à double confirmation ; seuils de signalement ; escrow (06b `pay`) |
| T08 | Fraude géo : faux rayon/position | moyen | serveur recalcule la distance (jamais le client) ; détection d'anomalie (job) |
| T09 | Media abuse : contenu illégal sur le portfolio | moyen | modération (SCR-123), signalement (DLG-011), hash des médias + blacklist |
| T10 | Sécurité mobile : reverse engineering | moyen | R8/ProGuard, minify ; secrets jamais embarqués (tokens via endpoint `/config`) |

## 2. Mapping OWASP Top 10 (2021)

| OWASP | Application TCHATCHA |
|---|---|
| A01 Broken Access Control | RBAC par garde ; tests d'autorisation négatifs ; filtre de tenant (pays) |
| A02 Cryptographic Failures | TLS partout ; chiffrement PII ; bcrypt coût 12 ; rotation des clés annuelle |
| A03 Injection | ORM paramétré ; `class-validator` ; interdiction concat SQL (review de code) ; SQLi via `details` jamais exposé |
| A04 Insecure Design | machine à états stricte (transitions uniques) ; idempotence ; escrow ; double confirmation |
| A05 Security Misconfiguration | images non-root, headers sécurité, `app.set('trust proxy')` contrôlé, debug off en prod |
| A06 Vulnerable Components | audit npm/pub hebdo (Dependabot + Trivy) — gates CI |
| A07 Auth Failures | JWT RS256 court (15 min), refresh rotatif + détection de rejeu, OTP limité |
| A08 Software Integrity | signature des images (cosign), checksum des releases, SBOM |
| A09 Logging Failures | logs structurés + audit événements (sans PII en clair) ; alertes sécurité |
| A10 SSRF | presigned URLs signées (jamais d'URL client vers serveur) ; whitelist webhook URLs |

## 3. Modèle de permissions (RBAC)

| Rôle | Domaine couvert (extrait) | Refus garanti |
|---|---|---|
| `CLIENT` | créer/lire ses demandes, devis, bookings, payer, aviser, litiges, RGPD | actions pro/admin |
| `PROFESSIONAL` | vitrine, services, dispo, devis sur demandes matchées, revenus, répondre aux avis | agir hors ses données |
| `DELIVERER` (P2) | courses assignées | — |
| `ADMIN` | validation, modération, arbitrage, sanctions, config, stats | actions business de l'app |

Règles : chaque endpoint déclare `@Roles(...)` + garde ; **jamais** de vérification
de rôle dans le use-case ; tests e2e négatifs par rôle (13 §5) ; sanctions :
`SUSPENDED`/`BANNED` (SCR-126) → refus 403 en middleware (cache Redis 5 min).

## 4. JWT & sessions

| Sujet | Règle |
|---|---|
| Signature | RS256 (paire de clés privée/publique) ; rotation trimestrielle |
| Claims | `sub` (uuid), `role`, `country`, `iss`, `aud`, `exp` (15 min), `jti` |
| Refresh | rotation systématique ; `family_id` ; rejeu d'un ancien refresh → **révocation de toute la famille** (T02/T07) |
| Révocation | logout → blacklist Redis du `jti` ; changement de mot de passe → famille entière |
| Stockage client | secure storage (flutter_secure_storage), jamais de logs |
| Sessions admin | courte durée (30 min), TOTP, liste des sessions visibles, revue trimestrielle |

## 5. OTP (SMS)

| Règle | Valeur |
|---|---|
| Génération | 6 chiffres CSPRNG, HMAC horodaté, TTL 5 min, usage unique |
| Envoi | cooldown 45 s ; max 5 requêtes/15 min ; verrouillage 15 min |
| Vérification | max 3 essais par code (`ck_otp_attempts`) puis code invalidé ; pas d'énumération (message identique) |
| Paiement sensible | OTP 2ᵉ facteur supplémentaire (SMS-002) pour gros montants (seuil config) |
| Fournisseur SMS | 2 fournisseurs (principal + repli) ; logs d'envoi sans code |

## 6. Rate limiting & anti-bot

| Mécanisme | Détail |
|---|---|
| IP + compte | tokens buckets Redis (12 §6) ; `Retry-After` |
| Login admin | 5 essais/15 min + TOTP + alertes |
| Device fingerprint | empreinte anonyme (jamais de PII) sur les actions sensibles |
| Captcha | hCaptcha/Cloudflare Turnstile sur les endpoints publics sensibles (si taux d'abus) |
| Comportement | vélocité inscription OTP, comptes par IP/device → file de révision (module `ai` P3) |
| WS | quota connexions + messages par session |

## 7. Audit & traçabilité

| Exigence | Mise en œuvre |
|---|---|
| Audit append-only | `audit.aggregate_events` (append-only, rétention 3 ans) — ajustement 1 |
| Actions auditables | connexions, OTP, paiements, transitions d'état, décisions admin, consentements, RGPD |
| Identification | `actor_id`, `actor_role`, IP, `trace_id` (16 §1) |
| PII | jamais de téléphone/CIN dans les logs ; événements chiffrés si nécessaire |
| Conservations | événements 3 ans ; logs 30 j hot / 12 mois archive ; OTP effacés immédiatement |

## 8. Fraude (spécifique marketplace)

| Scénario | Détection | Réponse |
|---|---|---|
| Comptes multiples (même IP/device) | vélocité + empreinte | file de révision ; vérification renforcée |
| Fausses prestations (paiement sans travail) | escrow + double confirmation + géo | gel ; litige ; arbitrage admin |
| Devis fantômes (pro ne vient pas) | taux d'annulation élevé → Trust Score | pénalité de score + avertissement |
| Note frauduleuse | une review par booking, détection de clusters (P3) | masquage + révision |
| Vol de compte + retrait | OTP 2ᵉ facteur, device inconnu, montants inhabituels | blocage + NT-017 + révocation |
| Lavage via devis | seuils de montant/répétition (job) | blocage des retraits + admin |

Toute suspicion = événement `security.flag` (audit) + dashboard sécurité (16 §6).

## 9. Protection des données (loi 2017-20 + RGPD — ajustement 6)

| Domaine | Règle |
|---|---|
| Minimisation | collecter uniquement ce qui est nécessaire à la fonction (PRD) |
| Consentements | versionnés, révocables (DLG-009) ; CGV obligatoire ; marketing opt-in |
| Chiffrement | téléphone/CIN chiffrés (application AES-GCM, clés en vault) |
| Export | `GET /me/export` → JSON/PDF sous 72 h (EM-006) ; données brutes hors fichiers médias publics |
| Suppression | 2 étapes (DLG-010) ; suppression effective 30 j ; anonymisation des logs |
| Rétention | données actives supprimées/archivées après inactivité 3 ans (job) |
| Sous-traitants | S3, FCM, SMS : contrats + liste des DPA ; jamais de vente de données |
| Signalements | droit de réponse pro ; modération 72 h |

## 10. Revue & responsabilités

| Cadence | Action |
|---|---|
| Chaque PR | SAST, secrets scan, dépendances, tests négatifs |
| Chaque release | DAST (ZAP), trivy, revue manuelle des endpoints sensibles |
| Mensuel | revue des logs de sécurité + alertes ; rotation clés admin |
| Trimestriel | exercice d'intrusion ciblé + revue du Threat Model (ce document) |
| Incident | post-mortem < 72 h ; mise à jour du Threat Model ; notification légale si PII (loi 2017-20) |

**Ce document est vivant** : tout changement d'architecture ou de fournisseur
(paiement, SMS, hébergement) déclenche une relecture §1-2.
