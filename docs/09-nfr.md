# NFR — Non Functional Requirements (TCHATCHA)

Version : 1.0 — Étape 4 (pré-requis de toute implémentation)
Objectifs réalistes pour le marché béninois (3G/4G, terminaux low-cost, coupures électriques, coût data).

---

## 1. Performances

| # | Exigence | Objectif réaliste | Mesure |
|---|---|---|---|
| NFR-P1 | API — lecture (accueil, recherche, fiches, listes) | P95 ≤ 350 ms (sans réseau client) | APM traces |
| NFR-P2 | API — écriture (publication besoin, devis, paiement) | P95 ≤ 600 ms ; paiement ≤ 1,5 s | APM traces |
| NFR-P3 | Recherche texte + géo (rayon) | P95 ≤ 800 ms pour 100 km² dense | k6 |
| NFR-P4 | Carte (chargement tuiles + résultats) | premier rendu ≤ 2 s en 4G | Lighthouse mobile |
| NFR-P5 | Démarrage app mobile | cold start ≤ 3 s (low-end) ; warm ≤ 1 s | perfetto / DevTools |
| NFR-P6 | Notifications push | livraison ≤ 5 s après déclencheur (99 %) | FCM + traces |
| NFR-P7 | Chat (message → affichage) | P95 ≤ 700 ms en 4G | traces |
| NFR-P8 | Upload média (photo 2-4 Mo) | ≤ 5 s en 4G (compression côté app) | traces |
| NFR-P9 | Taille app | APK ≤ 60 Mo ; IPA ≤ 90 Mo (sans assets lourds) | build |
| NFR-P10 | Données mobiles | page accueil ≤ 250 Ko ; résultats ≤ 150 Ko (pages) | DevTools |

## 2. Disponibilité

| # | Exigence | Objectif |
|---|---|---|
| NFR-D1 | Disponibilité API en production | ≥ 99,5 % mensuel (MVP) ; cible 99,9 % après Phase 2 |
| NFR-D2 | Fenêtres de maintenance | annoncées ≥ 48 h ; aucune coupure de données |
| NFR-D3 | Dépendance réseau faible | app utilisable en lecture seule hors-ligne (cache) |
| NFR-D4 | Pannes fournisseurs | bascule S3/MinIO + SMS/Push testée (runbook) |
| NFR-D5 | Heures de pointe | 18h–22h + dimanche (marché béninois) → surcapacité +50 % |
| NFR-D6 | Reprise | RTO ≤ 4 h ; RPO ≤ 15 min (voir §7) |

## 3. Montée en charge

| # | Exigence | Objectif |
|---|---|---|
| NFR-S1 | Lancement (M5 bêta) | 1 000 utilisateurs actifs / jour ; 50 req/s de pointe |
| NFR-S2 | 12 mois après lancement | 50 000 utilisateurs actifs / jour ; 250 req/s de pointe |
| NFR-S3 | Concurrence | 10 000 connexions chat simultanées (websocket, Phase 2) |
| NFR-S4 | Données | conçu pour 5 M lignes/table sans refonte (keyset, partitionnement futur) |
| NFR-S5 | Scaling | horizontal stateless : API scale-out par réplicas ; réplicas de lecture PG |
| NFR-S6 | Coût | P95 des coûts inférieur au budget mensuel (revu trimestriel) |

## 4. Sécurité

| # | Exigence | Référence |
|---|---|---|
| NFR-K1 | Authentification | JWT access 15 min + refresh rotatif 30 j + OTP SMS (voir `15-securite.md`) |
| NFR-K2 | Transport | TLS 1.2+ partout ; HSTS ; aucune clair sur le réseau |
| NFR-K3 | Données sensibles | téléphone/CIN chiffrés au repos ; mots de passe bcrypt coût 12 |
| NFR-K4 | Conformité | Loi béninoise 2017-20 + RGPD (export, suppression, consentements — ajustement 6) |
| NFR-K5 | Audits | journalisation d'audit (schéma `audit`) ; revue trimestrielle des accès |
| NFR-K6 | Tests de sécurité | SAST à chaque PR ; DAST + revue manuelle avant chaque release |

## 5. Accessibilité

| # | Exigence | Cible |
|---|---|---|
| NFR-A1 | Standard | WCAG 2.1 niveau AA (apps + web admin) |
| NFR-A2 | Textes | taille min 14 px ; contraste ≥ 4,5:1 (tokens `07d`) |
| NFR-A3 | Cibles tactiles | ≥ 44×44 px ; zones de tap espacées |
| NFR-A4 | Lecteurs d'écran | labels sémantiques sur tous les contrôles (TalkBack/VoiceOver) |
| NFR-A5 | Non-vision | tous les flux critiques réalisables sans couleur (badge, statuts) |

## 6. Compatibilité

| # | Exigence | Cible |
|---|---|---|
| NFR-C1 | Android | ≥ 8.0 (API 26) ; priorité test sur 8-12 Go RAM + Android 12+ |
| NFR-C2 | iOS | ≥ 15 ; App Store (Bénin) |
| NFR-C3 | Web admin | Chrome/Edge/Firefox/Safari 2 dernières versions majeures |
| NFR-C4 | Réseaux | 3G/4G, WiFi instable, perte réseau fréquente (offline-first) |
| NFR-C5 | Écrans | 320×480 (low-end) à 1080×2400 ; orientations portrait par défaut |
| NFR-C6 | DPI | densités x1.5 → x3.0 sans dégradation (assets vectoriels) |

## 7. Sauvegardes & reprise

| # | Exigence | Cible |
|---|---|---|
| NFR-B1 | PostgreSQL | PITR : WAL archivé continu + pg_basebackup quotidien |
| NFR-B2 | Médias (S3) | versioning + réplication régionale ; sauvegarde des métadonnées |
| NFR-B3 | Redis | données éphémères uniquement (jamais source de vérité) |
| NFR-B4 | Restauration | exercice de restauration complet ≥ 1 fois / trimestre |
| NFR-B5 | RPO / RTO | RPO ≤ 15 min ; RTO ≤ 4 h (documenté + testé) |
| NFR-B6 | Secrets | sauvegardés hors infrastructure (vault), rotation annuelle |

## 8. Maintenance

| # | Exigence | Cible |
|---|---|---|
| NFR-M1 | Migrations DB | versionnées par module, `down` inclus, zéro downtime (additive-first) |
| NFR-M2 | Déploiement | 1 commande / environnement ; rollback ≤ 15 min |
| NFR-M3 | Versioning | SemVer 2.0 + Conventional Commits (voir `14-cicd.md`) |
| NFR-M4 | Feature flags | bascule à froid pour tout changement risqué |
| NFR-M5 | Dépendances | audit hebdo (npm/pip/flutter) ; zéro vulnérabilité critique en prod |
| NFR-M6 | Documentation | Developer Handbook à jour ; ADR obligatoire pour toute décision |

## 9. Qualité du code

| # | Exigence | Cible |
|---|---|---|
| NFR-Q1 | Couverture tests | unitaires ≥ 80 % (domaine + use-cases) ; e2e ≥ 60 % des parcours P0 |
| NFR-Q2 | Lint / format | 0 erreur ; format automatique (Prettier / dart format) à chaque commit |
| NFR-Q3 | Complexité | analysée (SonarQube) ; aucune dette bloquante en release |
| NFR-Q4 | Revue de code | 2 approbations ; aucun merge sans revue |
| NFR-Q5 | Performance des dev | build backend ≤ 3 min (CI) ; build Flutter ≤ 15 min (cache) |

## 10. Monitoring & alertes

| # | Exigence | Cible |
|---|---|---|
| NFR-N1 | Logs structurés | JSON, corrélation `trace_id` (voir `16-observabilite.md`) |
| NFR-N2 | Métriques | 4 golden signals + métriques métier (demandes publiées, devis, conversions) |
| NFR-N3 | Alertes | page → réponse ≤ 30 min en heures ouvrées (8h–20h) |
| NFR-N4 | SLO | latence P95 API < 400 ms 99 % ; disponibilité ≥ 99,5 % |
| NFR-N5 | Dashboards | 1 dashboard « Santé », 1 « Business », 1 « Paiements », 1 « Sécurité » |
| NFR-N6 | Rétention logs | 30 j hot / 12 mois archive |

---

## Résumé (tableau de pilotage)

| Domaine | Objectif clé | Documents liés |
|---|---|---|
| Perf | API P95 ≤ 350 ms · cold start ≤ 3 s | `12-api-blueprint.md` |
| Dispo | 99,5 % · RTO 4 h · RPO 15 min | `17-infrastructure.md` |
| Charge | 50k actifs/j an 1 · 250 req/s | `06-schema-base.md` (index) |
| Sécurité | OWASP + conformité 2017-20/RGPD | `15-securite.md` |
| Accessibilité | WCAG AA | `07c-design-system.md`, `07d-design-tokens.md` |
| Compatibilité | Android 8+ / iOS 15+ · 3G/4G offline-first | `11-blueprint-flutter.md` |
| Sauvegardes | PITR + exercice trimestriel | `17-infrastructure.md` |
| Maintenance | zéro downtime · rollback 15 min | `14-cicd.md` |
| Qualité | unit ≥ 80 % · 0 dette bloquante | `13-strategie-tests.md` |
| Monitoring | SLO + alertes ≤ 30 min | `16-observabilite.md` |

Ces NFR sont **contractuels** : toute fonctionnalité livrée qui viole un NFR est
un bug (bloquant en release).
