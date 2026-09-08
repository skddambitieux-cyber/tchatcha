# 5.3 — Règles métier finales (TCHATCHA)

Version : 1.0 — Étape 5 (Lot 1). **Règles fermes et implémentables.**
Chaque règle porte un identifiant `BR-XXX` et est tracée vers sa source
(PRD `bug.md`, ADR, schéma `06`, US `07g`, FCT `08`). Toute contradiction
doit être signalée avant développement — ce document fait foi.

Sources de validation :
- Machine à états : `06-schema-base.md` §10 (v1.1, `06d`).
- Statuts : `quotes` (PENDING/COUNTERED/ACCEPTED/REJECTED/WITHDRAWN),
  `bookings` (CONFIRMED/IN_PROGRESS/COMPLETED/CANCELLED/NO_SHOW/DISPUTED/REFUNDED),
  `disputes` (OPEN/UNDER_REVIEW/RESOLVED/REJECTED).
- Réputation : `pros.reputation` (trust_score 0-5, trust_level, métriques brutes).
- Pays : schémas `geo`, `users`, `pros`, `market` (`06a`/`06b`).

---

## 1. Règles générales de marché

| # | Règle | Source |
|---|---|---|
| BR-001 | Tout enregistrement est rattaché à un pays (`country_code`) ; un utilisateur opère dans un seul pays à la fois (modifiable). | ADR-009/013, 06a §3 |
| BR-002 | Une personne physique = un compte ; roles multiples autorisés (ex. client + professionnel) mais une seule identité (`uq` téléphone + pays). | 06a, 10 MOD-01 |
| BR-003 | La langue de l'interface est indépendante du pays ; le contenu (traductions catégories) est localisé par pays (`Accept-Language`). | ADR-014, 12 |
| BR-004 | Actions sensibles (paiement, suppression compte, décisions admin) = OTP ou TOTP de confirmation (SMS-002). | 12 §4, 15 §5 |
| BR-005 | Le serveur est la source de vérité : toute valeur d'état (prix, statut, distance) est recalculée côté serveur, jamais acceptée du client. | 12, 15 §1 T08 |

---

## 2. Professionnels — vérification, badge, sanctions

### 2.1 Devenir vérifié (badge)

| # | Règle | Source |
|---|---|---|
| BR-010 | Le badge « Vérifié TCHATCHA » est attribué après modération humaine : **CIN valide + selfie correspondant** (vérification_level ≥ 2). | PRD §21, 10 MOD-03 |
| BR-011 | Documents obligatoires : CIN + selfie. Optionnels : document pro (RC/attestation), diplômes (→ verification_level 3). | 07k SCR-071 |
| BR-012 | Modération sous **72 h** (objectif moyen 24 h, NT-014/NT-015). Rejet = motif obligatoire + droit de re-soumettre. | 07k SCR-072, NFR |
| BR-013 | Sans badge, le pro est **inscriptible et visible** (sans le badge) mais ses devis restent autorisés ; le badge est un facteur de tri, pas un prérequis. | recherche, 12 |
| BR-014 | Le badge est révoqué si : sanction active (suspension/bannissement), fraude avérée (identité), dossier falsifié → vérification_level revenu à l'état antérieur + événement d'audit. | 15 T01/T07 |

### 2.2 Trust Score

| # | Règle | Source |
|---|---|---|
| BR-020 | `trust_score` (0–5) = fonction configurable des métriques brutes (avis, acceptation, ponctualité, annulations, litiges, ancienneté, vérification) ; recalculé par job + à chaque événement structurant. | 06d A2 |
| BR-021 | Score visible à partir de **5 missions terminées** ; avant : `NEW` (« nouvel arrivant ») sans note. | 07j SCR-086 |
| BR-022 | Niveaux : `NEW` (0 missions) → `LOW` (< 2,5) → `MEDIUM` (2,5-3,9) → `HIGH` (4,0-4,6) → `EXCELLENT` (> 4,6). Seuils réservés en config. | 06d A2 |
| BR-023 | Impact de chaque événement sur le score — **tableau d'impact** (section 8) : annulation de dernière minute et no-show du pro = pénalité forte ; réponse rapide = bonus. | 06d A2, cette étape |

### 2.3 Suspension / bannissement

| # | Règle | Source |
|---|---|---|
| BR-030 | **Avertissement** : 1er incident modéré (rapport recevable, taux d'annulation élevé). Notification NT-016. | 07k SCR-125 |
| BR-031 | **Suspension** (temporaire, 7-30 j, motif + durée) si : ≥ 3 signalements recevables (seuil config), 2 no-show, fraude géo, contenu abusif. Pendant : fiche inaccessible, devis refusés. | 07k SCR-126, 15 T07 |
| BR-032 | **Bannissement** (définitif) : fraude avérée, identité falsifiée, mise en danger, récidive post-suspension. → suppression de la vitrine, devis en cours annulés sans pénalité client. | 15 |
| BR-033 | Toute sanction est décidée par un admin (2FA), journalisée dans `audit` avec motif. | 15 §7, 10 MOD-11 |

---

## 3. Demandes (besoins) & devis

### 3.1 Cycle de la demande

| # | Règle | Source |
|---|---|---|
| BR-040 | Publication : titre ≤ 160, description ≤ 2000, catégorie feuille, position ou division obligatoire, budget min ≤ max même devise, date non passée. → statut **OPEN**. | 12 §9, 10 MOD-07 |
| BR-041 | **Expiration** : `expires_at` = publication + 48 h par défaut (configurable par catégorie) ; job → **EXPIRED** (uniquement si OPEN/QUOTED). | 06 §10, 06b |
| BR-042 | Un besoin expire même avec des devis reçus (si aucune action client) ; les devis deviennent `EXPIRED`/`WITHDRAWN` sans sélection. | 06 §10 |
| BR-043 | **Annulation** (statuts OPEN/QUOTED/NEGOTIATING/SELECTED) : le client annule, souvent gratuitement **avant sélection** ; motif recueilli (DLG-002). | 06d §10 |
| BR-044 | **Réouverture** (annulé → REOPENED) : uniquement **avant paiement** ; anciens devis conservés et à nouveau sélectionnables ; nouveaux devis autorisés (REOPENED → QUOTED). | 06d A1 |
| BR-045 | Annulation au statut SELECTED (déjà un pro choisi) : **pénalité** possible du pro (BR-090) ; la demande passe CANCELLED sans frais client si annulation rapide. | 06d §10, cette étape |

### 3.2 Devis

| # | Règle | Source |
|---|---|---|
| BR-050 | Un pro ne peut avoir qu'**un devis « en cours »** par demande (`uq_quotes_active`). Contre-office : le devis passe `COUNTERED` et un devis fils est créé. | 06b, 10 MOD-07 |
| BR-051 | **Durée de validité** : un devis `PENDING` reste valable tant que la demande n'a pas changé d'état ; il est invalidé si : demande EXPIRED, demand CANCELLED, autre pro ACCEPTED, ou demande REOPENED. | 06 §10 |
| BR-052 | **Retrait** : le pro peut retirer son devis (→ `WITHDRAWN`) tant que la demande n'est pas SELECTED ; sans pénalité métier (pénalité réputation possible si récurrent). | 06b |
| BR-053 | **Modifications** : un devis se modifie par une nouvelle contre-offre uniquement (pas d'édition in place) ; **max 4 contre-offres par paire (client↔pro)** puis verrouillage à la 5e parité. | cette étape (anti-négociation infinie) |
| BR-054 | Prix du devis **hors budget annoncé** : autorisé mais signalé au client (badge « hors budget ») ; pas de blocage (le pro peut justifier). | 12, 07i SCR-023 |
| BR-055 | Un devis accepté ne peut être ni modifié ni retiré. | 06d §10 |

### 3.3 Sélection

| # | Règle | Source |
|---|---|---|
| BR-060 | Choisir un devis (client) → demande **SELECTED** + les autres pros en cours notifiés (NT-004) + un seul `booking` créable sur ce devis (`uq_bookings_quote`). | 06d, 06b |
| BR-061 | La sélection est **irréversible** côté client (DLG-003) ; l'accord vaut engagement de créneau. | 07i SCR-025 |
| BR-062 | Après sélection, un créneau doit être réservé sous **24 h** (sinon rappel NT-006 puis annulation automatique sans frais). | cette étape, NFR |

---

## 4. Réservation, no-show, annulation de dernière minute

### 4.1 Créneau

| # | Règle | Source |
|---|---|---|
| BR-070 | Un créneau est verrouillé par consultation (`FOR UPDATE`) avec contrôle `tsrange` overlap : **aucun double booking** (CONFIRMED/IN_PROGRESS). | 06d A4 |
| BR-071 | Créneau proposé dans l'avenir et dans les disponibilités définies par le pro ; confirmation = statut **CONFIRMED** (paiement débité peu après, escrow). | 06b, 07j SCR-082 |

### 4.2 No-show et annulation

| # | Règle | Source |
|---|---|---|
| BR-080 | **No-show client** (absence au RDV, sans annulation < 2 h à l'avance) : le booking passe **NO_SHOW** après 1 h d'attente du pro ; le client perd la séance de validation mais le pro est **payé** (dédommagement, config %). | 06b (status NO_SHOW), cette étape |
| BR-081 | **No-show pro** (le pro ne vient pas) : **NO_SHOW** ; remboursement intégral au client ; pénalité forte du Trust Score (BR-087) + compteur (2 → suspension, BR-031). | cette étape |
| BR-082 | **Annulation de dernière minute client (< 24 h avant)**, avant arrivée : pénalité = 50 % du montant versée au pro (configurable) ; client noté comme annuleur dans le score côté pro (impact visibilité réduite). | cette étape |
| BR-083 | **Annulation de dernière minute pro (< 24 h)** : remboursement intégral + pro-pos eau d'un créneau équivalent sous 3 j ou pénalité verdict (25 % config) ; double compteur → suspension (BR-031). | cette étape |
| BR-084 | Annulation **hors délai (≥ 24 h)** : gratuite, des deux côtés, sans impact. | cette étape |
| BR-085 | Remboursement suite annulation pro : délai 3 j ouvrés sur le moyen de paiement d'origine. | 12, NFR |

### 4.3 Prestation partiellement réalisée

| # | Règle | Source |
|---|---|---|
| BR-086 | Prestation **partiellement réalisée** (docuée par preuves) : l'arbitrage peut retenir un **paiement proportionnel** (prorata des étapes convenues) ; la part non réalisée est remboursée au client ou libérée au pro selon responsabilité. | cette étape, 07k SCR-030 |
| BR-087 | La double confirmation (client + pro) reste le déclencheur normal de libération ; sans litige, les deux confirment → libération intégrale. | 06b, 10 MOD-07 |

---

## 5. Paiement, escrow, litiges, remboursement

### 5.1 Libération des fonds

| # | Règle | Source |
|---|---|---|
| BR-090 | Le paiement est capturé sur le compte du client (MoMo/Moov/espèces) et placé en **escrow** à la réservation (statut `AUTHORIZED`/`SUCCEEDED`, non libéré au pro). | 06b pay, 15 T07 |
| BR-091 | **Libération au pro** : uniquement à `COMPLETED` = double confirmation (client **et** pro) — espèce : statut de confirmation manuelle équivalent (le client confirme avoir payé, ou le pro confirme réception). | 06b, 07k SCR-029 |
| BR-092 | Libération automatique de secours : si le client ne confirme pas sous **72 h** après la confirmation du pro ET aucune preuve de litige → libération au pro (protection contre la rétention abusive). | cette étape |
| BR-093 | Espèces : jamais de capturation électronique ; le suivi est « à payer sur place » puis confirmation par les 2 parties. | 07i SCR-027 |
| BR-094 | Commission plateforme (config par catégorie, ex. 10 %) prélevée sur la part libérée au pro ; jamais sur un remboursement. | 07k SCR-129, NFR |

### 5.2 Litiges

| # | Règle | Source |
|---|---|---|
| BR-100 | Un litige s'ouvre **après paiement + réservation** (statut DISPUTED), par le client **ou** le pro, motif + preuves (≤ 5 médias) + description ≤ 1500 car. Un seul litige ouvert par booking (`uq_disputes_booking`). | 06b, 07k SCR-030 |
| BR-101 | À l'ouverture : le paiement est **gelé** (ni libéré ni remboursé) ; adversaire notifié ; délai d'arbitrage **72 h**. | 07k SCR-030, NFR |
| BR-102 | **Décision** (admin, 2FA) : client gagne (remboursement intégral ou % selon BR-086), pro gagne (libération), ou **compromis proportionnel**. Motif obligatoire, journalisée dans `audit`. | 07j SCR-124, 15 |
| BR-103 | Remboursement effectué dans les **3 j ouvrés**, sur le moyen d'origine ; crédité au pro sinon. | NFR, 12 |
| BR-104 | **Répartition de responsabilité** (règle par défaut) :
- Pro fautif avéré → remboursement client (≥ 90 %) + pénalité réputation + compteurs sanctions.
- Client fautif avéré → libération pro (≥ 90 %) ; le client conserve un droit d'avis honnête.
- Faute partagée / non avérée → compromis : proportionnel aux preuves (photos, messages, position) ; sans preuve → partage 50/50.
| | | cette étape |
| BR-105 | Litige rejeté comme abusif (clients ou pros récidivistes de litiges sans preuve) : pénalités de confiance et limitation des retraits (pro) ou OTP renforcé (client). | 15 §8 |

### 5.3 Remboursement

| # | Règle | Source |
|---|---|---|
| BR-110 | Cas de remboursement : no-show pro (100 %), annulation pro (100 % + créneau), annulation client < 24 h (part, BR-082), litige (selon décision), double paiement détecté (100 %). | 06d (PAID→REFUNDED) |
| BR-111 | Le remboursement annule commission : la transaction passe `REFUNDED`, le booking `REFUNDED`. | 06b pay/market |
| BR-112 | Idempotence : un remboursement ne se déclenche qu'une fois par transaction (+ déduplication webhooks). | 12 §7/§9 |

---

## 6. Avis & notation

| # | Règle | Source |
|---|---|---|
| BR-120 | **Qui peut noter** : uniquement le client d'un booking terminé (`COMPLETED`) ; **jamais** le pro sur un client, jamais de review croisée (US-043). | PRD §11, 10 MOD-10 |
| BR-121 | **Quand** : dans les 30 jours après COMPLETED ; après, l'avis est encore possible mais noté comme tardif (pas d'exclusion). | cette étape |
| BR-122 | Contenu : 5 critères obligatoires (général, ponctualité, qualité, rapport Q/P, politesse) + commentaire ≤ 1000 + photos optionnelles (≤ 5). | 07i SCR-031 |
| BR-123 | **Modification** : 1 seule modification autorisée sous **48 h** (correction/complément), tracée dans l'audit ; la note moyenne reflète la version publiée après correction. | cette étape |
| BR-124 | **Réponse du pro** : 1 seule réponse par avis, ≤ 500 car., publique, modérées. | 07k SCR-088, 10 |
| BR-125 | **Modération** : avis signalé (DLG-011) → file admin `OPEN`→`IN_REVIEW` ; décision : masquer ou maintenir ; un avis masqué ne compte ni dans la moyenne ni dans le Trust Score. | 06b, 07j SCR-123 |
| BR-126 | Avis déposé = engagement : pas de suppression par l'auteur après 24 h (sauf erreur prouvée → support). | cette étape |

---

## 7. Réputation — impact des événements (Trust Score)

Règles d'impact (config, pondérations de `pros.reputation`) :

| Événement | Impact score (config) | Compteur / conséquence |
|---|---|---|
| Mission terminée + avis ≥ 4 | +0,10 (bonus qualité) | completed_jobs++, avis pondéré |
| Réponse à un devis < 30 min | +0,03 | avg_response_min ↓ |
| Taux d'acceptation élevé (> 80 %) | +0,05 | acceptance_rate |
| Devis retiré (répété) | −0,03 / occurrence | compteur retraits |
| **Annulation pro ≥ 24 h** | neutre (rare) | compteur annulation propre |
| **Annulation pro < 24 h** | **−0,25** | → 2 en 30 j = suspension (BR-031) |
| **No-show pro** | **−0,50** | → 2 = suspension ; remboursement client |
| No-show client | neutre côté pro (client: pénalité financière, BR-080) | compteur côté client (visibilité pros) |
| Litige ouvert | −0,15 (dès ouverture) | disputes_count++ |
| Litige résolu en faveur du pro | +0,10 (annulation partiel −0,15) | réévaluation |
| Litige résolu contre le pro | −0,30 | compteur sanctions |
| Suspension/bannissement | score clôturé à `LOW` (ou gel) | vérification_level ↓ |
| Badge vérifié obtenu | +0,20 (une fois) | verification_level ≥ 2 |

Règles de calcul :
- **hausse plafonnée** : +0,50 max sur 30 j (anti « farm »).
- **baisse plafonnée** : −1,00 max sur 30 j (pas de spirale infinie sans événement).
- Le score affiché = arrondi 1 décimale ; les métriques brutes restent visibles (transparence, 07j SCR-086).
- Chaque recomputation est journalisée (`reputation.recomputed`).

| # | Réf |
|---|---|
| BR-130 | Impacts et seuils ci-dessus ; pondérations en config, jamais en code. | 06d A2, 19 §7 |

### Décisions produit post-FCT-016B2

Les impacts et seuils chiffrés documentés dans BR-020 et BR-130 ne constituent
pas une formule validée pour le pilote. Aucun calcul provisoire du Trust Score ne
doit être ajouté. Un lot distinct devra valider formule, pondérations,
versionnement et recalcul avant toute mise en œuvre ou promesse produit.

BR-094 est interprétée pour le pilote comme une hypothèse configurable : 10 % sur
la première prestation puis 6 % sur les suivantes entre les mêmes utilisateurs,
sans frais client. Ces taux ne sont pas une tarification commerciale définitive
et ne doivent pas être figés dans le code.

Le modèle opérationnel est hybride (autonome ou assisté), avec choix final du
client. Les coordonnées restent masquées avant l’étape autorisée ; la détection
anti-contournement est graduelle, sans sanction automatique sur simple détection,
avec avertissement, analyse, suspension progressive et recours. Escrow,
assistance, remboursement, garantie, litige et avis vérifiés restent internes.
Voir `docs/43-modele-operationnel-monetisation-pilote.md`.

---

## 8. Règles de fin de vie / RGPD

| # | Règle | Source |
|---|---|---|
| BR-140 | Compte inactif 3 ans → anonymisation (event `users.anonymized`) ; purge effective des données personnelles (sauf obligations légales). | 06d A6, 10 MOD-02 |
| BR-141 | Export des données sous 72 h (JSON/PDF) ; suppression 2 étapes + confirmation OTP, effectivité 30 j. | 07k SCR-034, NFR |
| BR-142 | Les conversations et médias échangés liés à un compte supprimé sont anonymisés (messages gardés hors PII pour l'arbitrage historique). | 15 §9 |

---

## 9. Table de traçabilité (règle → implémentation)

| Bloc | Règles | FCT | US | Module / écran |
|---|---|---|---|---|
| Marché | BR-001..005 | — | US-004 | cross (12) |
| Pro / badge / sanctions | BR-010..033 | FCT-020, FCT-025 | US-052, US-081, US-083 | professionals, admin / SCR-071-072, 122, 125, 126 |
| Demandes & devis | BR-040..062 | FCT-008, 009, 010, 011 | US-023..029, 056..058 | requests / SCR-019-025, 077-081 |
| Réservation / no-show / partiel | BR-070..087 | FCT-012, FCT-014 | US-031, 033, 034, 059, 060 | requests / SCR-026, 028, 082-084, 029 |
| Paiement / escrow / litige / remboursement | BR-090..112 | FCT-013, FCT-015 | US-032, US-035, US-083 | payments, requests, admin / SCR-027, 030, 124, 127 |
| Avis | BR-120..126 | FCT-016 | US-041..044 | reviews / SCR-031, 088, 123 |
| Réputation | BR-130 | FCT-024 | US-061, US-092 | professionals / SCR-086, 087, 014 |
| RGPD | BR-140..142 | FCT-026 | US-015 | users / SCR-034 |

**Règle de non-régression** : aucune décision produit ne modifie le statut d'une
règle BR-XXX sans mise à jour de ce document **et** de `08-specification-fonctionnelle.md`
(GWT concernés) dans la même PR.
