# 4.7 — Observabilité (TCHATCHA)

Version : 1.0 — Étape 4. Aligne `09-nfr.md` (§10), `15-securite.md` (§7/9).
Stack cible : **OpenTelemetry** (ADR-019) + Prometheus + Grafana + Loki + Alertmanager + Sentry (mobile).

---

## 1. Piliers & corrélation

| Pilier | Outil | Identifiant commun |
|---|---|---|
| Traces | OpenTelemetry → Tempo (ou Jaeger) | `trace_id` |
| Métriques | Prometheus (counters/histograms/gauge) | labels `service`, `module`, `endpoint`, `status`, `country` |
| Logs | Loki (JSON structuré) | `trace_id`, `request_id`, `actor_id` (jamais de PII) |
| Erreurs | Sentry (mobile + backend) | `trace_id` repris |
| Uptime | Blackbox exporter + synthétiques | — |

**Corrélation** : tout log/erreur porte `trace_id` (enveloppe d'erreur API 12 §5 →
client mobile l'affiche dans les rapports de bug).

## 2. Métriques (4 golden signals + métier)

### 2.1 RED (services)
- **Rate** : requêtes/s par endpoint (`http_server_requests_total`)
- **Errors** : taux d'erreur par status (5xx séparés des 4xx business)
- **Duration** : histogramme (P50/P95/P99) par endpoint — gates NFR-P1/P2

### 2.2 USE (ressources)
- PG : connexions, transactions/s, temps de requête, deadlocks, réplicas lag
- Redis : hit ratio, évictions, latence, mémoire
- S3/R2 : latence upload/download, erreurs 5xx
- Worker : jobs traités/échoués/requeued, âge de la file (Outbox lag)

### 2.3 Métriques métier (funel TCHATCHA)
`demandes publiées`, `devis envoyés`, `taux de réponse pros`, `devis acceptés`,
`bookings`, `paiements (montant, méthode)`, `conversions par canal`, `avis`,
`litiges ouverts/résolus`, `vérifications (TTM — time to moderation)`,
`utilisateurs actifs (DAU/WAU)`, `recherches (taux de résultat vide)`.
Labels : `country`, `category`. Ces métriques alimentent les dashboards et le
rapport mensuel (et les SLO §4).

## 3. Logs (structurés)

| Règle | Valeur |
|---|---|
| Format | JSON une ligne : `{ts, level, trace_id, request_id, service, module, event, message, meta{}}` |
| Niveaux | `debug` (dev), `info` (cycle de vie), `warn`, `error` (jamais de stack trace entière en prod → Sentry) |
| Interdits | PII (téléphone, CIN, OTP, tokens, photos) ; secrets ; corps de requête des endpoints sensibles |
| Événements d'audit | doublés dans `audit.aggregate_events` (15 §7) — les logs sont jetables, l'audit est la source |
| Retention | 30 j hot / 12 mois archive (NFR-N6) |
| Contextualisation | log de début/fin des use-cases (durée, résultat) ; log des transitions de la machine à états |

## 4. Traces & SLO

| Sujet | Règle |
|---|---|
| Instrumentation | OpenTelemetry automatique + spans manuels sur use-cases, DB, adaptateurs (SMS, push, MoMo) |
| Échantillonnage | 100 % des écritures/paiements ; 10 % des lectures ; paiement = span parent pour tout |
| SLO (NFR-N4) | latence API P95 < 400 ms sur 99 % des 30 derniers jours · dispo ≥ 99,5 % |
| Burn rate | alertes : 1 h à burn 14.4×, 24 h à 3× (multiples fenêtres) |

## 5. Monitoring & alertes

| Règle | Valeur |
|---|---|
| Alertmanager | notification : Slack + SMS/email on-call |
| Sev 1 (page) | API down, P95 > 2 s, paiements échoués > 5 %, Outbox lag > 10 min, réplicas lag > 5 min, perte disque |
| Sev 2 | P95 > 1 s, erreurs 5xx > 1 %, files worker > 10 min, hit ratio < 90 % |
| Sev 3 | tendances (mémoire, connexions) — ticket |
| Réponse | Sev 1 : ≤ 30 min heures ouvrées 8h-20h (NFR-N3) ; runbook par alerte (liens 18) |
| Tests synthétiques | Blackbox : login OTP, recherche, publication (5 min) depuis 2 régions + Bénin |
| On-call | rota (1 primary + 1 secondary), escalade automatique |

## 6. Dashboards (Grafana — NFR-N5)

| Dashboard | Contenu |
|---|---|
| 01 Santé | golden signals, ressources, files, Outbox lag, SLO burn |
| 02 Business | funnel §2.3, pays, catégories, conversions |
| 03 Paiements | volume, méthodes (MoMo/Moov/espèces), taux de succès par fournisseur, retraits, litiges |
| 04 Sécurité | rate limit, OTP échecs, nouveaux devices, sanctions, `security.flag`, 2FA |
| 05 Mobile | erreurs Sentry, cold start, jank, versions app actives |
| 06 Infra | coûts (R2/bande), scaling events, sauvegardes (succès/durée) |

Accès : admin + devs (viewer) ; `audit` de consultation pour l'admin.

## 7. Observabilité mobile

| Sujet | Règle |
|---|---|
| Erreurs | Sentry (Flutter) : exceptions, warnings, breadcrumbs réseau |
| Perf | `Performance` traces : cold start, temps écran, appels API ; jank via DevTools en release tests |
| Réseau | logs locaux (dernier N=200 requêtes) exportables dans les rapports de bug (jamais de tokens) |
| Versions | release tracking par build-number ; crash-free ≥ 99 % (NFR) |
| Hors-ligne | métrique : file d'attente (taille, reprises, abandons) |

## 8. Culture & processus

1. **Aucune feature sans instrumenter** : use-case = au moins une métrique métier + span OTel (checklist 18 §feature).
2. Les alertes se testent : exercice d'alerte trimestriel (faux incident).
3. Chaque incident → post-mortem : chronologie, impacts (SLO), causes, actions, alertes manquantes.
4. Le dashboard « Santé » est l'écran d'accueil de toute personne on-call.
5. Coûts : revue trimestrielle des volumes (traces 10 %, logs, alertes bruyantes désactivées).
