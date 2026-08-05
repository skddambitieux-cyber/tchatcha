# 3.1 — Product Flows (TCHATCHA)

Parcours utilisateur complets, par persona. Chaque étape référence les écrans (SCR)
et User Stories (US) associés (références complètes dans `07b` et `07g`).

---

## 1. Client — parcours complet

```mermaid
flowchart TD
    A[Découverte<br/>SCR-001 Landing / store] --> B{Création de compte}
    B -->|OTP SMS| C[Inscription<br/>SCR-004]
    C --> D{Recherche}
    D -->|Mot-clé / catégorie / carte| E[Résultats de recherche<br/>SCR-010]
    E --> F[Consultation fiche pro<br/>SCR-014]
    F -->|Portfolio, avis, badge vérifié, dispo| G{Demande}
    G -->|Mode B : publier un besoin| H[Publication<br/>SCR-042]
    G -->|Mode A : contact direct| H2[Chat / demande directe<br/>SCR-040]
    H --> I[Attente réponses]
    H2 --> I
    I --> J{Choix du devis}
    J -->|Compare devis, négocie| K[Négociation chat<br/>SCR-041]
    K --> L[Sélection d'un devis<br/>SCR-045]
    J --> L
    L --> M[Paiement<br/>MoMo / Moov / espèces<br/>SCR-050]
    M --> N[Prestation<br/>suivi + confirmation]
    N --> O[Avis post-prestation<br/>SCR-060]
    O --> P[Fin + réputation mise à jour]
```

Étapes clés et exigences :
- **Découverte sans compte** : recherche consultable sans connexion (basse friction) — la connexion n'est requise que pour contacter/publier.
- **Mode A** (recherche directe) et **Mode B** (publication) convergent vers la même réservation → paiement → avis (modèle marketplace, ADR-020).
- **Badge "Professionnel vérifié TCHATCHA"** affiché dès la fiche pro et dans les résultats — pilier de la promesse de confiance.

---

## 2. Professionnel — parcours complet

```mermaid
flowchart TD
    A[Inscription pro<br/>SCR-070] --> B{Vérification}
    B -->|CIN + selfie + documents| C[Dossier de vérification<br/>SCR-072]
    C --> D[Validation admin<br/>SCR-073 état PENDING]
    D -->|approuvé| E[Création de profil<br/>SCR-074]
    E --> F[Publication des services<br/>+ prix + portfolio<br/>SCR-076]
    F --> G[Activation + badge vérifié]
    G --> H{Réception des demandes}
    H -->|notification push| I[Demandes reçues<br/>SCR-080]
    I --> J{Devis}
    J -->|répond| K[Envoyer un devis<br/>SCR-082]
    K -->|contre-offre| K2[Négociation<br/>SCR-083]
    K2 --> K
    J -->|accepté| L[Réservation + planning<br/>SCR-086]
    L --> M[Exécution<br/>SCR-088]
    M -->|client + pro confirment| N[Paiement reçu<br/>SCR-090]
    N --> O[Statistiques + revenus<br/>SCR-092]
    O --> P[Avis + Trust Score mis à jour]
```

Étapes clés et exigences :
- **Vérification avant visibilité** : aucun pro non vérifié dans les résultats (confiance TCHATCHA).
- **Disponibilités** : horaires + congés + créneaux → aucun double booking (schéma §Ajustement 4).
- **Devis** : réponse rapide récompensée (délai moyen = métrique du Trust Score).
- **Statistiques** : missions, taux d'acceptation, annulations, revenus (PRD §19).

---

## 3. Livreur (Phase 2) — parcours complet

```mermaid
flowchart TD
    A[Inscription livreur<br/>SCR-100] --> B[Validation<br/>CIN + véhicule<br/>SCR-101]
    B --> C{Disponibilité}
    C -->|online| D[Missions disponibles<br/>SCR-102]
    D -->|accepte| E[Course assignée<br/>SCR-103]
    E --> F[Navigation GPS<br/>SCR-104]
    F --> G[Retrait à l'établissement]
    G --> H[Livraison au client]
    H -->|livré + photo/preuve| I[Paiement de la course<br/>SCR-105]
    I --> J[Gains + historique<br/>SCR-106]
    J --> C
```

Étapes clés et exigences :
- Position temps réel (Redis → `delivery_runs`), assignation au plus proche (PRD §18).
- Preuve de livraison photo (litiges livraison).
- État online/offline = contrôle du livreur, jamais imposé.

---

## 4. Administrateur — parcours quotidien

```mermaid
flowchart TD
    A[Connexion admin<br/>SCR-110] --> B[Dashboard<br/>SCR-111]
    B --> C{Validation}
    C -->|dossiers pro| D[File de validation<br/>SCR-112]
    D -->|approuve / rejette| E[Décision + note]
    E --> B
    B --> F{Modération}
    F -->|avis signalés, contenus| G[File de modération<br/>SCR-114]
    G --> E
    B --> H{Paiements}
    H --> I[Transactions + reversements<br/>SCR-116]
    I --> E
    B --> J{Signalements}
    J --> K[Litiges et signalements<br/>SCR-118]
    K -->|arbitrage| E
    B --> L{Statistiques}
    L --> M[Stats nationales + par pays<br/>SCR-120]
```

Étapes clés et exigences :
- **Files unifiées** (validation, modération, litiges) — `admin.validation_tasks` + `admin.reports` + `market.disputes`.
- Chaque décision est tracée (audit) — rien n'est réversible sans trace.
- Multi-pays : sélecteur de pays en tête de dashboard (ADR-013).

---

## 5. Règles transverses (tous les personas)

| Règle | Détail |
|---|---|
| Basse friction | Consultation sans compte ; connexion seulement pour agir |
| États systématiques | Chaque action a : loading, vide, erreur, offline, succès, skeleton |
| Confirmation destructrice | Suppression/annulation/paiement = dialog de confirmation |
| Idempotence perçue | Boutons désactivés pendant l'envoi (pas de double envoi devis/paiement) |
| Offline | Lecture seule des données en cache + file d'attente des messages |
| Accessibilité | Cibles tactiles ≥ 48 px, contrastes AA, textes énoncés par lecteurs d'écran |
