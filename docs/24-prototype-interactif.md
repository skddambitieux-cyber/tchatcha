# 5.2 — Prototype interactif & validation (TCHATCHA)

Version : 1.0 — Étape 5 (Lot 5). Fichiers livrés dans `docs/maquettes/`,
traçables vers les SCR (07b), les US (07g) et les règles métier
(`19-business-rules.md`). Langue : français.

---

## 1. Objectif

- **Valider le flux de bout en bout** avant développement (Étape 6).
- **Tester la logique métier** par la navigation ; pas seulement le rendu visuel.
- Fournir une **user flow de référence** unique Client et une Marketplace (pro).

## 2. Livrables

| Fichier | Rôle | Accès |
|---|---|---|
| `docs/maquettes/index.html` | Galerie centrale (49 écrans + liens parcours) | ouvrir dans un navigateur |
| `docs/maquettes/parcours-client.html` | Parcours Client, 8 étapes / 14 écrans | lien depuis la galerie |
| `docs/maquettes/parcours-marketplace.html` | Parcours Pro, 7 étapes / 9 écrans | lien depuis la galerie |
| `docs/maquettes/css/tchatcha.css` | Design System (tokens 07d en variables CSS) | inclus par les écrans |
| `docs/maquettes/{client,pro,livreur,admin,erreurs}/**.html` | Écrans haute fidélité | galerie |

Lancement local : ouvrir `index.html` directement (aucun serveur requis).

## 3. Parcours Client — « Amina » (8 étapes)

Persona US-01 : Amina Dossou, quartier Fidjrossè (Cotonou), budget 200 000 F.

| Étape | Écrans visités | Source / Règles |
|---|---|---|
| 1. Onboarding & OTP | `client/onboarding.html` → `client/inscription-otp.html` | SCR-001..004 · BR-140 |
| 2. Recherche | `accueil.html` → `recherche.html` / `categories.html` / `carte.html` | SCR-005..007 · BR-052 |
| 3. Choix pro | `liste-pros.html` → `fiche-pro.html` | SCR-008/011 · BR-010 |
| 4. Publication besoin | `publication-besoin.html` | SCR-019/020 · BR-040..047 |
| 5. Devis | `reception-devis.html` → `comparaison-devis.html` | SCR-022 · BR-060..062 |
| 6. Réservation | `reservation.html` | SCR-026 · BR-050..052 |
| 7. Paiement | `paiement.html` (+ cas `erreurs/paiement-refuse.html`) | SCR-027 · BR-090..093 |
| 8. Avis | `messagerie.html` → `avis.html` | SCR-017/031 · BR-120..126 |

### Points de décision testables (Client)
1. **Tri de la liste** : hybride distance × Trust Score (Gamme USE ; BR-020..023).
2. **Budget vs devis** : dépassement signalé en amont (validation inline — `creation-devis.md` côté pro).
3. **Expiration devis** : désactivation silencieuse à 72 h (BR-062) — parcours alternative `erreurs/devis-expire.html`.
4. **Escrow** : message de sécurisation visible avant paiement (BR-091).

## 4. Parcours Marketplace — « Kossi » (7 étapes)

Persona US-41 : Kossi A., artisan carreleur, Fidjrossè, ★4,8.

| Étape | Écrans visités | Source / Règles |
|---|---|---|
| 1. Création profil | `pro/creation-profil.html` | SCR-073 · CAT-001 |
| 2. Vérification | `pro/verification.html` (+ vue `admin/verification-pros.html`) | SCR-071/072 · BR-010..014 |
| 3. Demande reçue | `pro/dashboard.html` → `pro/reception-demandes.html` | SCR-077/078 · BR-056 |
| 4. Devis | `pro/creation-devis.html` | SCR-080 · BR-060 |
| 5. Prestation | `pro/calendrier.html` (+ cas `pro-indisponible.html`) | SCR-082 · BR-080/086 |
| 6. Paiement | `pro/revenus.html` (+ vue `admin/paiements.html`) | SCR-086 · BR-110..113 |
| 7. Notation | `pro/trust-score.html` → `statistiques.html` → `missions-terminees.html` | SCR-083..085 · BR-020 |

### Points de décision testables (Pro)
1. **Badge** : étapes de vérification manquantes affichées (check-inprogress — `verification.html`).
2. **Réponse rapide** : bonus Trust Score mis en avant (BR-056).
3. **Prix ≤ budget** : contrôle inline (BR-061).
4. **Prestation partielle/no-show** : impact visible sur score (BR-080/086).

## 5. Cas d'erreur couverts (décision bug.md)

| Écran | Règle associée | Comportement attendu |
|---|---|---|
| `erreurs/paiement-refuse.html` | BR-090..091 | réessayer / autre moyen / aucun débit |
| `erreurs/pro-indisponible.html` | BR-050..051 | suggestion date alternative, aucun frais |
| `erreurs/devis-expire.html` | BR-062 | demande réactivation / relance |
| `erreurs/compte-suspendu.html` | BR-033 | motif + durée + recours |
| `erreurs/litige-ouvert.html` | BR-104 | dialogue horodaté + preuves |
| `erreurs/perte-connexion.html` | — | file d'attente messages, offline lecture |

## 6. Critères d'acceptation du prototype

À cocher avant d'entamer l'Étape 6 (développement MVP) :

- [ ] Un testeur reproduit le parcours Client en < 5 min sans aide.
- [ ] Le testeur comprend la sécurisation de l'argent (escrow) au moment du paiement.
- [ ] Les 3 devis concurrents sont comparables côte à côte (prix, délai, note).
- [ ] Le pro comprend comment obtenir le badge « Vérifié » en 2 étapes.
- [ ] Un cas d'erreur sur 6 est rejoué sans frustration (message clair + action).
- [ ] La marque (tokens 07d + identité 22) est appliquée partout sans exception.
- [ ] Aucun écart de vocabulaire entre maquettes, règle métier et lisibilité (ex. « devis » vs « estimation »).

## 7. Feedback prévu

| Rôle | Échantillon minimal | Modalité |
|---|---|---|
| Clients (pilote) | 5 (dont 2 non-tech) | test utilisateur filmé + entretien |
| Pros (pilote) | 5 artisans | test utilisateur filmé + entretien |
| Modération / Opérations | 2 | débrief conflictuel, gabarit RSE |
| Direction | 1 session | démo parcours + décision GO |

## 8. Sortie

- Ce document + les fichiers vivants de `docs/maquettes/`.
- Liste des **ajustements** (ex. simplification vocabulaire, re-triage liste) à
  intégrer au backlog MVP (Étape 5 → `25-preparation-technique.md`).
- **Gate :** pas de code de développement avant validation du prototype
  (cf. bug.md Étape 6).