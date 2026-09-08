# Phase 4 — Spécification Fonctionnelle (TCHATCHA)

Version : 0.1 (document maître — sera complété avec l'API, Étape 4)
Rôle : **référence unique** pour développeurs, testeurs et contributeurs.
Elle fait le lien : User Story ↔ Wireframe (SCR) ↔ API (endpoint) ↔ Module backend.

---

## 1. Comment lire ce document

Chaque fonctionnalité suit le même gabarit :

```
[FCT-XXX] — <nom>
US :      US-XXX (critères dans 07g)
Écrans :  SCR-XXX (wireframes 07i/07j)
API :     METHOD /api/v1/... (contrat 08-api.md)
Module :  <module backend> (schéma 06a/06b)
Règles :  règles métier + événements + permissions
```

Cette table de correspondance est la **colonne vertébrale** de la cohérence :
un changement dans une US se répercute sur l'écran, l'API et le module.

---

## 2. Matrice de traçabilité fonctionnelle (MVP)

| FCT | Fonctionnalité | US | Écrans | API (à détailler Étape 4) | Module |
|---|---|---|---|---|---|
| FCT-001 | Inscription par OTP | US-002, US-005 | SCR-004 | POST /auth/register, /auth/otp/verify | auth |
| FCT-002 | Connexion / session | US-003, US-008 | SCR-003 | POST /auth/login, /auth/refresh | auth |
| FCT-003 | Locale & pays | US-004 | SCR-002 | GET /geo/countries | geography |
| FCT-004 | Accueil (feed) | US-021, US-022 | SCR-005 | GET /home | search + pros |
| FCT-005 | Recherche & filtres | US-016…US-019 | SCR-007, 008 | GET /search | search |
| FCT-006 | Carte & rayon | US-020 | SCR-009 | GET /search (geo) | search |
| FCT-007 | Fiche professionnel | US-091, US-054 | SCR-011…014 | GET /professionals/:id | professionals |
| FCT-008 | Publication besoin | US-023, US-024 | SCR-019, 020, 021 | POST /requests | requests |
| FCT-009 | Réception & devis pro | US-056, US-057 | SCR-077…080 | GET/POST /requests/:id/quotes | requests |
| FCT-010 | Négociation | US-026, US-058 | SCR-024, 081 | POST /quotes/:id/counter | requests |
| FCT-011 | Sélection & annulation/réouverture | US-027, US-028 | SCR-022, 023, 025 | POST /quotes/:id/select, POST /requests/:id/cancel | requests |
| FCT-012 | Réservation créneau | US-031 | SCR-026 | GET /professionals/:id/slots, POST /bookings | requests + availability |
| FCT-013 | Paiement | US-032 | SCR-027 | POST /payments/initiate, /verify | payments |
| FCT-014 | Prestation & confirmation | US-033, US-034 | SCR-028, 083 | POST /bookings/:id/complete | requests |
| FCT-015 | Litige | US-035 | SCR-030 | POST /disputes | requests + admin |
| FCT-016 | Avis multi-critères | US-041…US-043 | SCR-031 | POST /reviews | reviews |
| FCT-017 | Messagerie | US-046 | SCR-017, 018 | GET/POST /conversations, /messages | messaging |
| FCT-018 | Notifications | US-047, US-048 | SCR-016 | GET /notifications | notifications |
| FCT-019 | Favoris | US-013 | SCR-015 | GET/POST/DELETE /favorites | users |
| FCT-020 | Vérification pro | US-052, US-081 | SCR-071, 072, 122 | POST /professionals/:id/verifications, PUT /admin/verifications/:id | professionals + admin |
| FCT-021 | Profil & services pro | US-053, US-054 | SCR-073…075 | PUT /professionals/me, /services, /portfolio | professionals |
| FCT-022 | Disponibilités pro | US-055 | SCR-076 | PUT /professionals/me/availability | professionals |
| FCT-023 | Revenus & retrait | US-062 | SCR-085 | GET /wallet, POST /payouts | payments |
| FCT-024 | Stats & Trust Score | US-061, US-092 | SCR-086 | GET /professionals/me/reputation | pros (reputation) |
| FCT-025 | Dashboard & arbitrage admin | US-083…US-085 | SCR-121…128 | GET/POST /admin/... | admin |
| FCT-026 | RGPD (export, suppression) | US-015 | SCR-034 | GET /me/export, DELETE /me | users + audit |

---

## 3. Gabarits de règles (transverses à chaque FCT)

### 3.1 Règles d'autorisation (RBAC)
| Rôle | Peut faire |
|---|---|
| CLIENT | publier besoin, négocier, sélectionner, payer, aviser, litige |
| PROFESSIONAL | répondre aux demandes, devis, réservations, retraits, stats |
| DELIVERER (P2) | accepter courses, livrer |
| ADMIN | valider, modérer, arbitrer, stats, bannir |

### 3.2 Règles d'événements (Outbox — `audit.events`)
Chaque FCT émet les événements consommés par : notifications, indexation recherche,
réputation, paiements. Ex. FCT-009 : `request.quoted` → NT-001, reindex, avg_response.

### 3.3 Règles de validation (exemples FCT-008)
- Titre requis (≤ 160 car.), description ≤ 2000 car., catégorie feuille obligatoire.
- Budget : max ≥ min, même devise.
- Date : pas dans le passé.
- Lieu : GPS ou division obligatoire.
- Période d'ouverture : `expires_at` = now + 48 h (configurable par catégorie).
- Écriture = transaction + événement `request.published` (aggregate_events).

### 3.4 Règles d'idempotence
- Paiement : webhooks dédupliqués (`uq_webhook_events`).
- Publication : `client_idempotency_key` (header) → pas de double demande.

---

## 4. Critères d'acceptation (template Given/When/Then)

Exemple — FCT-008 (US-023) :

```
GIVEN un client connecté à Cotonou
WHEN il publie un besoin "Pose de carrelage 150 m²" avec photos, budget
     150 000–250 000 FCFA, date 12 sept, urgence normale
THEN la demande est créée avec le statut OPEN
AND les pros de la catégorie Carrelage à moins de 10 km reçoivent
     une notification (NT-011)
AND l'événement request.published est enregistré (audit)
AND la demande expire dans 48 h (job d'expiration)
```

Toutes les US du backlog (07g) recevront leur GWT ici, couplés aux tests e2e
(Étape 5) : un test e2e = un critère d'acceptation.

---

## 5. Couverture du document (plan de rédaction)

| Section | Contenu | Statut |
|---|---|---|
| 1–4 | Méthode + matrice + gabarits | ✅ livré (cette version) |
| 5.1 | Détail FCT-001 à FCT-010 (GWT + règles) | à rédiger à l'Étape 4 (API) |
| 5.2 | Détail FCT-011 à FCT-020 | idem |
| 5.3 | Détail FCT-021 à FCT-026 | idem |
| 6 | Contrats API complets (endpoints, payloads, erreurs) | `08-api.md` (Étape 4) |
| 7 | Règles d'état (machine à états marketplace) | réf. `06-schema-base.md` §10 |
| 8 | Glossaire produit | à rédiger |

Règle : **aucune FCT n'est implémentée sans son GWT approuvé** (discipline de l'Étape 5).

---

## 6. Lien avec les documents existants

```
07g User Stories ──┐
07i/07j Wireframes ─┼──→ 08 Spec fonctionnelle ──→ Étape 5 (dev + tests)
06a/06b Schéma ────┤         │
02 ADR ────────────┘         ↓
                      08-api.md (Étape 4)
```

## 7. Décisions produit post-FCT-016

Le modèle de mise en relation est hybride : recherche autonome avec filtres
métier, zone/distance, disponibilité, vérification, note et Trust Score, ou
parcours assisté avec qualification TCHATCHA et présélection de deux ou trois
artisans (un seul possible pour urgence ou service standardisé). Le client garde
le choix final. Devis, réservation, paiement, protection, litige et avis restent
dans TCHATCHA.

La politique anti-contournement masque les coordonnées avant l’étape autorisée,
privilégie la messagerie interne et applique une détection graduelle sans sanction
automatique sur simple signal. Les mesures progressent de l’avertissement au
recours, dans le respect des données personnelles.

Le modèle de commission 10 % première prestation / 6 % suivantes est une
hypothèse configurable du pilote, sans frais client et sans valeur définitivement
codée. Le paiement reste simulé tant qu’un prestataire financier agréé n’est pas
validé juridiquement et réglementairement au Bénin/UEMOA.

Le Journal TCHATCHA est cadré comme une future fonctionnalité de contenu local,
publications sponsorisées, modération, statistiques et demande de devis depuis
une publication. Il n’est pas une dépendance du chemin critique immédiat du MVP.
