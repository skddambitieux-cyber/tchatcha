# 4.8 — Infrastructure (TCHATCHA)

Version : 1.0 — Étape 4. Préparation avant le code (configs à créer à l'Étape 5 dans `infra/`).
Aligne `09-nfr.md` (dispo, sauvegardes, scaling), `14-cicd.md` (déploiement).

---

## 1. Vue d'ensemble (cible prod)

```
                  ┌──────────┐
   Users ────────▶│ CDN      │  Cloudflare (statique + médias cache)
                  │  WAF     │
                  └────┬─────┘
        HTTPS /api ────┼──────────────────────┐
                  ┌────▼──────────────────┐  │
                  │ Reverse proxy (nginx/ │  │  TLS terminaison, rate limit IP,
                  │   Traefik)           │  │  gzip, /admin protégé IP + 2FA
                  └────┬────────┬─────────┘  │
                  ┌────▼─────┐ ┌▼──────────┐ │
                  │ API v1   │ │ API v1    │◀┘  stateless, scale horizontal
                  │ (Docker) │ │ (Docker)  │    rolling blue/green (14 §6)
                  └────┬─────┘ └────┬──────┘
        ┌──────────────┼────────────┼──────────────┐
   ┌────▼────┐   ┌─────▼────┐ ┌────▼────┐   ┌──────▼──────┐
   │ PG 16   │   │ Redis    │ │ S3 R2   │   │ Worker      │
   │ + PostGIS│  │ (cache,  │ │ (médias,│   │ (outbox,    │
   │ primary  │  │  queue)  │ │  export)│   │  rappels,   │
   │ + replica│  │          │ │         │   │  jobs)      │
   └──────────┘  └──────────┘ └─────────┘   └─────────────┘
   (VPS Bénin / région ouest-africaine)
```

Hébergement recommandé : VPS/cloud dans la région (latence) OU infra OVH
(Bénin/Paris) ; **décision ferme à l'Étape 5** avec coûts.

## 2. Docker & images

| Règle | Valeur |
|---|---|
| Backend | Dockerfile multi-stage (builder node → runtime distroless/node), **non-root**, `HEALTHCHECK` |
| Base image | images officielles épinglées par digest ; scan Trivy gate (14 §5) |
| Compose dev | `docker-compose.yml` : pg 16 + postgis, redis 7, minio (S3), adminer (dev), app (hot reload) |
| Compose staging | proche prod : + worker, proxy, observabilité (loki, prometheus, grafana, tempo) |
| Tags | `sha-<short>` (dev/CI) → `vX.Y.Z` (release) ; images signées (cosign) — 15 §2 A08 |
| Volumes | données PG/Redis **jamais** dans le conteneur ; médias hors conteneur |

## 3. Environnements

| Env | But | Données | Secrets |
|---|---|---|---|
| `dev` | développeurs | fixtures/testcontainers locaux | locales (`.env.dev` gitignoré) |
| `staging` | CI e2e, charge, DAST, revue | anonymisées + synthétiques | vault stage |
| `prod` | production | réelles | vault prod (jamais visibles des devs) |
| `beta` (M5) | 30 utilisateurs réels | réelles (consentement) | prod-like |

Règle : config 12-factor — tout par variables d'environnement (jamais de config
dans le code) ; validation du schéma d'env au démarrage (`class-validator`).

## 4. Secrets

| Règle | Valeur |
|---|---|
| Stockage | vault (HashiCorp Vault ou cloud SSM) ; `.env` seulement en dev |
| Accès | rotation annuelle ; revue des accès trimestrielle (15 §10) |
| Jamais | secrets dans git (gitleaks gate 14 §9), logs, image Docker, CI logs |
| Clés API | fournisseurs (SMS, FCM, MoMo/Moov) : par environnement, jamais réutilisées |
| Clés de chiffrement | PII AES-GCM : clé maîtresse en vault, clés de données rotatives |

## 5. Sauvegardes & restauration (NFR-B, NFR-D6)

| Composant | Stratégie | RPO | RTO |
|---|---|---|---|
| PostgreSQL | PITR : WAL archiving continu (WAL-G) + `pg_basebackup` quotidien (2 régions) | ≤ 15 min | ≤ 4 h |
| Médias R2 | versioning + réplication ; métadonnées dans PG (backup inclus) | ≤ 1 j | ≤ 4 h |
| Redis | éphémère (cache/sessions) ; perte = dégradation, pas de perte de données | — | recréation |
| Config/secrets | vault backup chiffré | ≤ 1 j | ≤ 1 h |
| Exercices | restauration complète testée ≥ 1×/trimestre (NFR-B4) ; runbook dans 18 | | |
| Chiffrement | sauvegardes chiffrées au repos (PII) | | |

## 6. Scaling (NFR-S)

| Niveau | Action |
|---|---|
| Lancement (M5) | 1-2 API (HA), 1 PG primary + 1 replica lecture, Redis, worker |
| 12 mois (50k actifs) | API ×3-4 (autoscaling), PG replica ×2, Redis cluster (ou sharding), partitionnement des tables chaudes (prévu 06), CDN activé |
| Pics 18h-22h | autoscale par CPU + file worker ; pré-warm des caches (feed) |
| Lecture | cache Redis (feed, catégories) ; réplicas de lecture pour recherche/stats |
| Écriture | Outbox + worker (jamais d'écriture synchrone lourde) |
| Stateless | API sans état local → scale horizontal illimité (ADR : choix dès Étape 1) |

## 7. Reverse proxy & TLS

| Règle | Valeur |
|---|---|
| Proxy | nginx (ou Traefik) : terminaison TLS, HTTP/2, gzip/brotli, timeouts ajustés, body size limits (12 §9) |
| TLS | Let's Encrypt, renouvellement automatique ; HSTS 1 an ; TLS 1.2+ |
| Rate limit IP | module proxy (premier niveau) + Redis (niveau application) |
| `/admin/*` | restriction IP (VPN admin) + 2FA TOTP (15 §4) |
| Headers | `X-Content-Type-Options`, `X-Frame-Options`, CSP (web admin) — 12 §4 |

## 8. CDN (Cloudflare)

| Règle | Valeur |
|---|---|
| Actifs | images médias (R2 connecté), build Flutter web, tuiles carto statiques |
| Cache | images : 7 j immutable (hash dans l'URL) ; API : **jamais** de cache CDN (Redis fait le job) |
| WAF | règles OWASP core + rate limit ; protection admin ; challenges anti-bot (Turnstile) |
| Fallback | si CDN down → origine directe (survie opérationnelle) |

## 9. Réseau & durcissement

| Règle | Valeur |
|---|---|
| Réseau | VPC privé : API→DB/Redis en réseau interne, jamais exposés |
| Firewall | seuls 80/443 exposés ; SSH par clé + IP restreinte ; fail2ban |
| Mises à jour | OS : unattended security patches ; images Docker : rebuild hebdo |
| Utilisateurs | service non-root ; conteneurs read-only où possible |
| Observabilité | agent OTel/exporteurs Prometheus internes (pas d'exposition publique) |

## 10. Plan d'incident (résumé — détail runbooks 18)

| Incident | Action | Cible |
|---|---|---|
| API down | failover automatique (healthcheck + rolling) ; Sev 1 alert | RTO ≤ 4 h (souvent < 15 min) |
| PG down | promote replica (repmgr/Patroni) | RPO ≤ 15 min |
| Corruption | restauration PITR (exercice trimestriel) | ≤ 4 h |
| Paiement provider | bascule MoMo↔Moov, file retry, tableau admin (SCR-127) | ≤ 15 min |
| Fuite de données suspectée | procédure légale loi 2017-20 + RGPD (15 §9), notification < 72 h | documentée |

## 11. Coûts (budget indicatif)

| Poste | Lancement | 12 mois |
|---|---|---|
| VPS/compute | 2 vCPU ×2 + 8 Go | autoscale ×4 |
| PG (managed ou VPS) | 2 vCPU / 16 Go + replica | + replica ×2 |
| R2 + bande CDN | faible | médias dominants |
| SMS / FCM / OTel | volumétrique | revu trimestriel |

Revue des coûts trimestrielle avec le dashboard Infra (16 §6) ; tout écart > 20 %
du budget → alerte + revue d'architecture.

**Décisions à acter à l'Étape 5** (ADR à créer) : hébergeur, répartition
managed vs VPS, réplica strategy (Patroni vs managed), fournisseur SMS final.
