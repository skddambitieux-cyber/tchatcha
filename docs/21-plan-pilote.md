# 5.5 — Plan de lancement pilote (Cotonou – Abomey-Calavi)

Version : 1.0 — Étape 5 (Lot 3).
Périmètre validé : **couloir Cotonou ↔ Abomey-Calavi** (décision utilisateur).
Objectif : valider la pertinence produit et la chaîne complète avant la montée en charge nationale.

---

## 1. Objectifs chiffrés

| # | Objectif | Cible | Fenêtre |
|---|---|---|---|
| P-01 | Professionnels inscrits et actifs | **100** | fin de pilote (12 sem.) |
| P-02 | Utilisateurs (clients) enregistrés | **500** | fin de pilote |
| P-03 | Demandes (besoins) publiées | **1 000** | fin de pilote (≥ 12/semaine récurrent) |
| P-04 | Taux de satisfaction (avis ≥ 4/5 + NPS) | **> 80 %** | suivi hebdo |
| P-05 | Taux de complétion du parcours (publier → avis) | ≥ 60 % | suivi hebdo |
| P-06 | Taux de réponse des pros aux demandes | ≥ 60 % < 4 h | suivi hebdo |
| P-07 | Zéro incident grave (paiement, sécurité) | 0 | continu |

## 2. Périmètre géographique (zones du couloir)

| Zone | Communes / quartiers | Justification |
|---|---|---|
| **Cotonou** | Cotonou 1er-13e arrondissements : Fidjrossè, Gbégamey, Agla, Védoko, Godomey lato… | densité pros + clients + restaurants |
| **Gligla / Houéyiho / Calavi** | Abomey-Calavi : Houéyiho, Calavi Tokpota, Zinvié, Kpanroun, Godomey (lacis Ouest) | croissance, étudiants (UAC), ménages |
| **Servitude** | axe RNIE2 (Cotonou–Calavi) | déplacements pros/types de chantier |

> Le rayon par défaut de recherche reste 10 km ; zones d'intervention couvertes par
> `pros.locations` (rayon) + `pros.coverage_areas` (communes entières).

## 3. Segments prioritaires au lancement

1. **Pros construction** (maçons, carreleurs, plombiers, électriciens) — cœur du Mode B.
2. **Restaurants / fast-food** du couloir (≈ 30) — vitrine + prise de contact (P2 livraison plus tard).
3. **Services maison** (ménage, jardinage) — demande fréquente et récurrente.
4. **Numérique** (dépannage ordinateur, graphistes) — bonne marge, bons témoignages.

## 4. Canaux d'acquisition

| Canal | Cible | Action pilote |
|---|---|---|
| **Pros (bouche-à-oreille + terrain)** | artisans marchés, quincailleries, réseaux | visites terrain + onboarding assisté (parrain, QR) ; badge « fondateur » |
| **Restaurants** | maquis/restos du couloir | démo + inscription gratuite 6 mois ; visibilité « premiers » |
| **Réseaux sociaux** (FB, WhatsApp, TikTok) | clients 18-45 | contenus démo (vidéos chantier/ménage), groupe WhatsApp pilote |
| **Partenariats locaux** | UAC (Calavi), associations de quartier | canaux étudiants + communautaires |
| **Parrainage** | clients | 1 parrain = 1 000 FCFA de crédit après 5 demandes (config) |
| **Identité terrain** | flyers autocollants commerces pros | QR → fiche pro |

## 5. Phases du pilote (12 semaines)

| Phase | Semaines | Activités | Gate |
|---|---|---|---|
| **P0 — Préparation** | −2 → 0 | MVP bêta prêt (Étape 6), seed catalogue (20), pros fondateurs (10), onboarding terrain, affichage légal, back-office admins | 10 pros prêts à recevoir |
| **P1 — Alpha terrain** | 1-2 | 30 pros fondateurs ; 100 clients ; charge manuelle de demandes initiées (AMO) ; corriger retours | parcours complet OK chez ≥ 5 pros réels |
| **P2 — Croissance** | 3-8 | Objectif 60 pros / 300 clients / ~70 demandes/sem. ; premiers litiges + arbitrages réels ; optimisation recherche | 60 pros actifs, satisfaction ≥ 70 % |
| **P3 — Consolidation** | 9-12 | Cible 100 pros / 500 clients / 1 000 demandes cumulées ; tests M6 (stores), revue NFR, décision Go/No-Go national | **P-01..P-07 atteints** |

Coordinated : un **AMO/« growth » dédié** (fondateur) + 1 chargé d'acquisition pros à temps partiel ; suivi hebdo sur les dashboards `16`.

## 6. KPIs & tableau de bord pilote (hebdo)

| KPI | Formule | Cible | Source |
|---|---|---|---|
| Pros actifs | pros avec ≥ 1 devis/30 j | ≥ 100 | `pros.profiles` |
| Clients actifs | clients avec ≥ 1 session/30 j | ≥ 500 | sessions |
| Demandes publiées | count status OPEN→… | ≥ 1 000 | `market.service_requests` |
| Taux réponse pros | devis envoyés / demandes matchées | ≥ 60 % | `quotes` |
| Délai médian 1er devis | median(request.published→quote) | ≤ 4 h | `audit.aggregate_events` |
| Taux complétion | bookings COMPLETED/REVIEWED / demandes | ≥ 60 % | bookings |
| Satisfaction | avis ≥ 4/5 (overall) + NPS ≥ 30 | > 80 % | `review` |
| Taux litige | litiges / bookings payés | < 2 % | disputes |
| Coût d'acquisition | budget / nouveaux | pilote : non prioritaire | finance |
| Rétention 4 sem. | clients ayant ≥ 2 demandes | ≥ 40 % | sessions |

Consolidé dans `dashboard 02 Business` (`16`) + export CSV hebdomadaire au fondateur.

## 7. Protection des données pilote

- Consentement explicite au collecte (DG-009) ; données réelles **limitées** au pilote consent.
- Téléphones/médias pros : chiffrés (15 §9) ; accès admin restreint (2FA).
- Conformité loi 2017-20 + informations légales (mentions, éditeur) avant P1.

## 8. Risques & mitigations

| Risque | Impact | Prob. | Mitigation |
|---|---|---|---|
| Liquidation côté demande (peu de demandes) | élevé | moyenne | AMO qui amorce les demandes (P1), campagne marketing locale, pros pré-recrutés |
| Liquidation côté offre (peu de pros réactifs) | élevé | moyenne | onboarding assisté, badge fondateur, rémunération test (coupons) |
| Fraude paiement/mobile money | élevé | faible | escrow + double confirmation + 2FA (15 §8) — testé pendant pilote |
| Restaurants peu intéressés avant la livraison (P2) | moyen | moyenne | vitrine + commande au comptoir/sur place dans le pilote (pas de livraison avant P2) |
| Qualification des demandes (pros reçoivent trop de demandes hors zones) | moyen | moyenne | matching strict catégorie + rayon + zones (10 MOD-07) ; désabonnement par métier |
| Connectivité/3G | moyen | certaine | offline-first (11 §6), compression, tuiles légères |
| Concentre sur 1-2 pros très demandés (déséquilibre offre) | moyen | moyenne | délégation pro (P2) ; file d'attente de demandes raisonnable |

## 9. Go / No-Go national (critères à la fin de P3)

**GO national** si : P-01..P-04 atteints **et** Délai ≤ 4 h **et** litiges < 2 %
**et** rétention ≥ 40 % **et** coût/acquisition < seuil défini en P2.
**No-Go / pivot** sinon : analyse post-mortem des 3 KPIs les plus faibles,
revue du modèle d'acquisition et/ou du découpage pilote.

## 10. Échéancier idéal (indicatif, si Étape 6 validée en T0)

| Jalon | Date (indic.) |
|---|---|
| Validation Étape 5 (maquettes + prototype + règles) | T0 |
| Développement MVP (Étape 6) | T0 + 12-16 sem. |
| M5 — Bêta fermée pilote (P0) | T0 + 16 sem. |
| P1 — Alpha terrain | T0 + 17-18 sem. |
| P2 — Croissance | T0 + 19-24 sem. |
| P3 — Consolidation + décision Go/No-Go | T0 + 25-28 sem. |
| M6 — Lancement public (si GO) | T0 + 30 sem. |