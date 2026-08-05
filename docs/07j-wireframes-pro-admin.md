# 3.7 — Wireframes basse fidélité — App Professionnel & Admin

Mêmes règles que `07i-wireframes.md` : SCR, objectif, entrées, sorties, actions,
états, erreurs, navigation, US. Sans couleur, sans image.

---

## FLOW F — Inscription et activation pro

### SCR-070 — Inscription pro (choix du rôle)
```
┌──────────────────────────┐
│  Vous êtes ?             │
│                          │
│  [ Artisan / indépendant ]│
│  [ Entreprise / commerce ]│
│  [ Restaurant (P2) ]     │
│  [ Livreur (P2) ]        │
│                          │
│  Vous pourrez aussi      │
│  commander comme client. │
│  [ Continuer ]           │
└──────────────────────────┘
```
Objectif : orienter le profil (type de pro).
Entrées : type.
Sorties : rôle + type stockés.
Actions : sélection, continuer.
États : multi-rôle autorisé (client aussi).
Erreurs : —.
Navigation : ← SCR-004 ; → SCR-071.
US : US-051.

### SCR-071 — Dossier de vérification
```
┌──────────────────────────┐
│  <  Vérification         │
│  Pour obtenir le badge   │
│  « Vérifié TCHATCHA »    │
│                          │
│  [✓] Pièce d'identité    │  ← upload + statut
│  [✓] Selfie              │
│  [ ] Document pro (RC, attestation) — optionnel
│  [ ] Diplôme (optionnel) │
│                          │
│  Vos documents sont      │
│  confidentiels.          │
│  [ Soumettre mon dossier ]│
└──────────────────────────┘
```
Objectif : collecter CIN + selfie (+ docs) — PRD §21.
Entrées : fichiers (upload parallèle, compression).
Sorties : verifications PENDING + événement admin.
Actions : upload (BTS-006), soumettre.
États : uploads %, checklist ; bouton désactivé tant que CIN+selfie manquants.
Erreurs : fichier illisible → réessayer.
Navigation : ← SCR-070 ; → SCR-072.
US : US-052.

### SCR-072 — Suivi de vérification
```
┌──────────────────────────┐
│  <  Vérification         │
│  [⏳ En cours de contrôle]│
│  Temps moyen : 24 h      │
│                          │
│  Vous serez notifié dès  │
│  que votre badge sera    │
│  attribué.               │
│                          │
│  [ Voir l'état de mon profil ]
└──────────────────────────┘
```
Objectif : rassurer pendant la modération.
Entrées : statut du dossier.
Sorties : rafraîchissement périodique (poll léger).
Actions : revoir le profil.
États : PENDING → APPROVED (badge) / REJECTED (motif + renvoyer).
Erreurs : —.
Navigation : ← SCR-071 ; → SCR-073 (si approuvé) ou SCR-071 (rejet).
US : US-052.

### SCR-073 — Création de profil
```
┌──────────────────────────┐
│  <  Mon profil           │
│  [photo] [télécharger]   │  ← avatar + bannière
│  Nom / enseigne *        │
│  [ … ]                   │
│  Métier principal *      │
│  [ Artisans > Carreleur ▾]
│  Années d'expérience     │
│  [ 15 ]                  │
│  Présentation *          │
│  [ … ]                   │
│  Ville / quartier *      │
│  [ Cotonou ▾ ][ Fidjrossè ▾ ]
│  Prix indicatif *        │
│  [ 1500 ] [FCFA] [par m² ▾]
│  [ Enregistrer ]         │
└──────────────────────────┘
```
Objectif : créer la vitrine (PRD §9).
Entrées : toutes les données de fiche.
Sorties : profile ACTIVE (si vérifié) ou DRAFT.
Actions : saisie, enregistrer.
États : progression sauvegardée ; aperçu public disponible.
Erreurs : champs requis ; prix incohérent.
Navigation : ← SCR-072 ; → SCR-074 (services).
US : US-053.

### SCR-074 — Services
```
┌──────────────────────────┐
│  <  Mes services         │
│  [+ Ajouter un service]  │
│                          │
│  [card service]          │
│  Pose de carrelage       │  ← prix, unité, principal ⭐
│  1 500–2 000 F/m²        │
│  [✎][🗑]                 │
│  [card service]          │
│  Fourniture carrelage    │
│  …                       │
└──────────────────────────┘
```
Objectif : lister les métiers proposés (1 pro = N services).
Entrées : service (catégorie feuille, prix, unité, description).
Sorties : services visibles dans la fiche.
Actions : ajouter (sheet formulaire), éditer, supprimer, marquer principal.
États : liste vide → CTA.
Erreurs : —.
Navigation : ← SCR-073 ; → SCR-075.
US : US-054.

### SCR-075 — Portfolio
```
┌──────────────────────────┐
│  <  Portfolio            │
│  [+ Ajouter] (photos/vidéos)
│  [img] [img] [img] [img] │  ← grille 3 colonnes
│  [img] [img] [img] [+]   │
│  Tri par drag (web) /    │
│  boutons ↕ (mobile)      │
│  [img]                   │  ← étiquette AVANT/APRÈS
│  [ Valider ]             │
└──────────────────────────┘
```
Objectif : montrer les réalisations (PRD §10).
Entrées : médias (upload S3).
Sorties : portfolio publié sur la fiche.
Actions : upload, tri, supprimer, marquer avant/après.
États : uploads % ; skeleton grille.
Erreurs : upload échoué → réessayer.
Navigation : ← SCR-074 ; → SCR-076.
US : US-054.

### SCR-076 — Disponibilités
```
┌──────────────────────────┐
│  <  Disponibilités       │
│  Horaires hebdo          │
│  [Lun]  [08:00–12:00] [14:00–18:00]
│  [Mar]  …                │
│  [Mer]  …                │
│  [Ajouter une période]   │
│                          │
│  Congés / indispo        │
│  [12–16 août : vacances] │  ← overrides
│  [+ Ajouter]             │
│                          │
│  Réservé (prochain RDV)  │
│  [6 sept 09:00 – Kossi client]
│  [ Voir mon planning ]   │
└──────────────────────────┘
```
Objectif : gérer créneaux, congés (anti double réservation).
Entrées : créneaux hebdo, overrides.
Sorties : slots actifs → calendrier client.
Actions : ajouter/éditer, congés, voir planning.
États : synthèse des plages libres ; conflit détecté → avertissement.
Erreurs : chevauchement de période → blocage.
Navigation : ← SCR-075 ; → SCR-077/082.
US : US-055.

---

## FLOW G — Quotidien du pro

### SCR-077 — Dashboard pro
```
┌──────────────────────────┐
│  Bonjour Kossi 👋        │  ← sans emoji en prod ?→ « Kossi A. »
│  [✓ Vérifié]  [★ 4,8]    │
│                          │
│  Aujourd'hui             │
│  ● 2 rendez-vous         │
│  ● 1 demande en attente  │
│                          │
│  [Demandes] [Planning]   │
│  [Revenus]  [Statistiques]│  ← 4 grandes tuiles
│                          │
│  Dernière demande        │
│  [card demande]          │  ← Carrelage 150 m², Cotonou
│  [Répondre]              │
└──────────────────────────┘
```
Objectif : vue du jour et accès aux 4 zones.
Entrées : position, statut.
Sorties : KPIs du jour.
Actions : répondre, tuiles, liste.
États : skeleton ; vide → état vide.
Erreurs : —.
Navigation : ← SCR-073 ; → SCR-078/082/085/086.
US : US-056.

### SCR-078 — Demandes reçues
```
┌──────────────────────────┐
│  <  Demandes             │
│  [Toutes] [À répondre] [En cours]
│                          │
│  [card demande]          │
│  Carrelage 150 m² · Urgent
│  Cotonou · 3 km          │
│  Budget : 150k–250k      │
│  Reçue il y a 12 min     │
│  [Répondre]              │
│  [card demande] (répondu)│  ← état devis envoyé
└──────────────────────────┘
```
Objectif : gérer les demandes reçues (Mode B).
Entrées : liste + filtres.
Sorties : demande sélectionnée.
Actions : répondre, voir.
États : priorité urgente en tête ; badge « Nouveau ».
Erreurs : —.
Navigation : ← SCR-077 ; → SCR-079.
US : US-056, US-057.

### SCR-079 — Demande — détail + devis
```
┌──────────────────────────┐
│  <  Demande              │
│  Carrelage 150 m²        │
│  Urgent · Cotonou Fidjrossè
│  [photos]                │
│  Description…            │
│  Budget : 150k–250k      │
│  Date : 12 sept · 09:00  │
│  [📍 Itinéraire]         │
│                          │
│  Votre devis (1)         │
│  [card : 200 000 F · 6 j]│
│  [ Envoyer un devis ]    │
│  [ Proposer contre-offre ]│
└──────────────────────────┘
```
Objectif : analyser et répondre.
Entrées : request_id.
Sorties : devis envoyé → statut QUOTED.
Actions : envoyer devis (SCR-080), contre-offre (SCR-081), itinéraire, discuter.
États : statut de réponse ; délai moyen affiché.
Erreurs : —.
Navigation : ← SCR-078 ; → SCR-080/081.
US : US-057.

### SCR-080 — Envoyer un devis
```
┌──────────────────────────┐
│  <  Votre devis          │
│  Prix *                  │
│  [ 200 000 ] FCFA        │
│  Délai *                 │
│  [ 6 ] jours             │
│  Message                 │
│  [ Fourniture incluse,   │
│    garantie 1 an… ]      │
│  [ Envoyer le devis ]    │
└──────────────────────────┘
```
Objectif : formuler l'offre (prix, délai, message).
Entrées : prix, délai, message.
Sorties : quote + notification client + événement.
Actions : envoyer (désactivé si prix invalide).
États : spinner envoi.
Erreurs : prix ≤ 0 ; hors budget client (avertissement).
Navigation : ← SCR-079 ; → SCR-077.
US : US-057.

### SCR-081 — Négociation
```
┌──────────────────────────┐
│  <  Négociation          │
│  Devis : 200 000 F       │
│  Client propose :        │
│  [ 180 000 F ]           │
│  « Prix du marché… »     │
│                          │
│  [ Accepter 180 000 ]    │
│  [ Contre-proposer ]     │  → [montant]
│  [ Refuser ]             │
└──────────────────────────┘
```
Objectif : négocier (chaîne de contre-offres).
Entrées : contre-offre reçue.
Sorties : accord (SELECTED) ou relance.
Actions : accepter, contre-proposer, refuser.
États : historique de la négociation affiché.
Erreurs : —.
Navigation : ← SCR-079 ; → SCR-077.
US : US-058.

### SCR-082 — Planning (calendrier)
```
┌──────────────────────────┐
│  <  Planning             │
│  [ ‹ Août 2026 › ]       │
│  L  M  M  J  V  S  D     │
│  ·  ·  ·  ·  ·  ●  ·     │  ← ● = RDV
│  ...                     │
│  Rendez-vous du 6        │
│  [09:00 – Client X · Pose]│
│  [14:00 – Client Y · Pose]│
│  [ Ajouter un bloc indispo ]
└──────────────────────────┘
```
Objectif : vue agenda (PRD §19).
Entrées : semaine/mois.
Sorties : journées structurées.
Actions : RDV → détail, ajouter indispo, drag (web).
États : jours avec RDV marqués.
Erreurs : —.
Navigation : ← SCR-077 ; → SCR-083.
US : US-059.

### SCR-083 — Prestation en cours
```
┌──────────────────────────┐
│  <  Mission              │
│  Client : X · Fidjrossè  │
│  [Contacter] [Itinéraire]│
│  Statut                  │
│  ● Payé                  │
│  ● En cours              │
│  ○ Terminé               │
│                          │
│  [ Je confirme la mission terminée ]
└──────────────────────────┘
```
Objectif : suivre et confirmer (double confirmation).
Entrées : booking.
Sorties : COMPLETED + paiement libéré.
Actions : confirmer, contacter.
États : timeline.
Erreurs : —.
Navigation : ← SCR-082 ; → SCR-086.
US : US-060.

### SCR-085 — Revenus
```
┌──────────────────────────┐
│  <  Revenus              │
│  Solde disponible        │
│  [ 350 000 FCFA ]        │  ← money, taille display
│  [ Retirer ]             │  ← bouton (payouts)
│                          │
│  Ce mois-ci : 520 000 F  │
│  Missions : 8 · Note : 4,8│
│  Dernières transactions  │
│  [+200 000] 6 sept · Pose
│  [+150 000] 2 sept · Pose
│  [Historique complet]    │
└──────────────────────────┘
```
Objectif : argent gagné + retrait (PRD §19 Revenus).
Entrées : période.
Sorties : solde + historique + demande de retrait.
Actions : retirer (sheet méthode), historique.
États : historique vide → CTA.
Erreurs : retrait indisponible (solde min.) → message.
Navigation : ← SCR-077 ; → SCR-085b (retrait).
US : US-062.

### SCR-086 — Statistiques & Trust Score
```
┌──────────────────────────┐
│  <  Statistiques         │
│  [barres : missions/mois]│  ← graphique simple
│                          │
│  Trust Score             │
│  [ 4,6 / 5 ]  [Niveau HAUT]
│  Missions : 32           │
│  Taux d'acceptation : 78 %
│  Taux d'annulation : 2 % │
│  Réponse moyenne : 20 min│
│  Ponctualité : 4,7 ★     │
│  Litiges : 0             │
│  [ Comment l'améliorer ? ]│
└──────────────────────────┘
```
Objectif : piloter sa réputation (US-092).
Entrées : métriques calculées.
Sorties : score + facteurs.
Actions : conseils (bulle info par facteur).
États : score non calculé avant 5 missions → indicateur.
Erreurs : —.
Navigation : ← SCR-077.
US : US-061, US-092.

---

## FLOW H — Administrateur (web)

### SCR-121 — Dashboard admin
```
┌──────────────────────────┐
│ TCHATCHA Admin           │
│ [BJ ▾]  [Rechercher…]    │
│ ┌────────┬────────┬─────┐│
│ │ Pros    │ Demandes│ Dev.││  ← 4 KPIs
│ │ 2 430   │ 1 205   │ …  ││
│ ├────────┼────────┼─────┤│
│ │ Revenus │ Litiges │ Avis││
│ └────────┴────────┴─────┘│
│ En attente               │
│ ● 12 vérifications       │
│ ● 3 litiges              │
│ ● 8 signalements         │
│ [Voir les files]         │
└──────────────────────────┘
```
Objectif : pilotage national + files (PRD §20).
Entrées : pays.
Sorties : KPIs + files.
Actions : sélecteur pays, files, recherche.
États : chargement KPIs (snapshot nightly).
Erreurs : —.
Navigation : → SCR-122/123/124/128.
US : US-084.

### SCR-122 — File de validation
```
┌──────────────────────────┐
│  <  Vérifications (12)   │
│  [Filtre : tous ▾]       │
│  ┌─────────────────────┐ │
│  │ Kossi A. · Carreleur│ │
│  │ CIN ✓ Selfie ✓      │ │
│  │ [voir les docs]     │ │
│  │ [Approuver] [Rejeter]│ │
│  └─────────────────────┘ │
│  ┌─────────────────────┐ │
│  │ …                   │ │
│  └─────────────────────┘ │
└──────────────────────────┘
```
Objectif : approuver/rejeter (badge).
Entrées : dossier (médias, profil).
Sorties : décision + audit + notification pro.
Actions : voir docs (zoom), approuver, rejeter (+motif obligatoire).
États : pagination ; badge compteur.
Erreurs : —.
Navigation : ← SCR-121 ; → (détail dossier).
US : US-081.

### SCR-124 — Litiges
```
┌──────────────────────────┐
│  <  Litiges (3)          │
│  ┌─────────────────────┐ │
│  │ #L-102 · Pose · 200k │ │
│  │ Client vs Kossi A.   │ │
│  │ « Travail non fini » │ │
│  │ [Preuves] [Arbitrer] │ │
│  └─────────────────────┘ │
│  Arbitrage :             │
│  ( ) Client gagne (remboursement)
│  ( ) Pro gagne           │
│  ( ) Compromis (50/50)   │
│  Motif * [ … ]           │
│  [ Valider la décision ] │
└──────────────────────────┘
```
Objectif : arbitrer (protection des 2 parties).
Entrées : litige + preuves + historique.
Sorties : décision + remboursement éventuel + audit.
Actions : voir preuves, décider, valider.
États : preuves chargées (médias).
Erreurs : décision sans motif bloquée.
Navigation : ← SCR-121.
US : US-083.

### SCR-128 — Statistiques nationales
```
┌──────────────────────────┐
│  <  Statistiques         │
│  [BJ ▾] [30 derniers jours ▾]
│  [carte heatmap]         │  ← communes
│  [graphiques :          │
│   pros actifs, demandes,│
│   volume transactions]  │
│  Top catégories          │
│  [Artisans] [Maison] [Auto]
└──────────────────────────┘
```
Objectif : pilotage (PRD §20).
Entrées : pays, période.
Sorties : séries (snapshots).
Actions : filtres, export CSV.
États : données agrégées (stats_snapshots).
Erreurs : —.
Navigation : ← SCR-121.
US : US-084.

---

## Règles wireframes transverses

1. Un écran = 1 objectif = 1 action primaire.
2. Les 8 champs (objectif, entrées, sorties, actions, états, erreurs, navigation, US) sont obligatoires — les écrans restants (notifications, favoris, paramètres, RGPD, messagerie, litige, profil, admin utilisateurs/paiements) suivent le même template ; ils seront formalisés au même niveau de détail avant le passage aux maquettes.
3. Espacements issus des tokens (space.md = base 16) ; hiérarchie : titre → contenu → action.
4. Aucune couleur ni image — uniquement structure, hiérarchie, espacement, navigation.
