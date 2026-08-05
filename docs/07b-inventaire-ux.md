# 3.2 — Inventaire UX complet (TCHATCHA)

Tout ce qui doit être conçu, par catégorie. Chaque écran porte un identifiant `SCR-XXX`
(→ traçabilité US dans `07g-user-stories.md`). Le détail des écrans (structure,
hiérarchie) viendra au wireframing (3.7) ; ici, on fixe le **périmètre complet**.

---

## 1. Écrans — App Client

| SCR | Écran | US liées |
|---|---|---|
| SCR-001 | Landing / Splash + onboarding (3 étapes) | US-001 |
| SCR-002 | Choix langue + pays (première ouverture) | US-004 |
| SCR-003 | Connexion (téléphone + OTP) | US-003, US-006 |
| SCR-004 | Inscription (téléphone, OTP, nom, consentements) | US-002, US-005 |
| SCR-005 | Accueil (recherche, catégories, pros populaires, promos, restaurants proches) | US-021, US-022 |
| SCR-006 | Catégories (arborescence 2 niveaux) | US-016 |
| SCR-007 | Recherche (barre, filtres, tri) | US-016…US-019 |
| SCR-008 | Résultats de recherche (liste) | US-016…US-019 |
| SCR-009 | Carte interactive (résultats + rayons) | US-020 |
| SCR-010 | Filtres (bottom sheet : distance, note, prix, dispo, catégorie) | US-018, US-019 |
| SCR-011 | Fiche professionnel (photo, métier, bio, expérience, prix, horaires, dispo) | US-091 |
| SCR-012 | Fiche pro — avis (liste + moyennes multi-critères) | US-041…US-044, US-091 |
| SCR-013 | Fiche pro — portfolio (galerie avant/après, vidéos) | US-054 |
| SCR-014 | Fiche pro — vérifié (badge, stats, Trust Score) | US-091, US-092 |
| SCR-015 | Favoris (liste) | US-013 |
| SCR-016 | Notifications (boîte) | US-047, US-048 |
| SCR-017 | Messagerie — liste des conversations | US-046 |
| SCR-018 | Messagerie — conversation (texte, photos, position) | US-046 |
| SCR-019 | Publication de besoin — étape 1 (description + photos) | US-023, US-024 |
| SCR-020 | Publication de besoin — étape 2 (budget + date + adresse + urgence) | US-023, US-024 |
| SCR-021 | Publication de besoin — confirmation + suivi (états) | US-029 |
| SCR-022 | Demande — détail (devis reçus, comparaison) | US-025, US-029 |
| SCR-023 | Devis — détail (prix, délai, message du pro) | US-025, US-026 |
| SCR-024 | Négociation (chat + contre-offre) | US-026 |
| SCR-025 | Sélection d'un devis (confirmation) | US-027 |
| SCR-026 | Rendez-vous — choix du créneau (calendrier dispo) | US-031 |
| SCR-027 | Paiement (MoMo / Moov / espèces, statut) | US-032 |
| SCR-028 | Prestation — suivi (statuts, rappels) | US-033, US-034 |
| SCR-029 | Prestation — confirmation (client) | US-034 |
| SCR-030 | Litige (ouverture, description, preuves) | US-035 |
| SCR-031 | Avis — rédaction (5 critères + photos) | US-041, US-042, US-043 |
| SCR-032 | Profil client (infos, adresses) | US-011, US-012 |
| SCR-033 | Paramètres (langue, notifications, consentements) | US-004, US-014, US-005 |
| SCR-034 | RGPD (export, suppression) | US-015 |
| SCR-035 | Aide / support (FAQ, contact) | — |

## 2. Écrans — App Professionnel

| SCR | Écran | US liées |
|---|---|---|
| SCR-070 | Inscription pro (rôle + parcours dédié) | US-051 |
| SCR-071 | Dossier de vérification (CIN, selfie, documents) | US-052 |
| SCR-072 | Suivi de vérification (PENDING → résultat) | US-052 |
| SCR-073 | Création de profil (bio, expérience, prix, horaires) | US-053 |
| SCR-074 | Services — gestion (liste, prix, unité) | US-054 |
| SCR-075 | Portfolio — gestion (photos, avant/après) | US-054 |
| SCR-076 | Disponibilités (créneaux récurrents + congés) | US-055 |
| SCR-077 | Dashboard pro (vue du jour : demandes, RDV) | US-056 |
| SCR-078 | Demandes reçues (liste + filtres par métier) | US-056 |
| SCR-079 | Demande — détail (photos, budget, adresse) | US-057 |
| SCR-080 | Envoyer un devis (prix, délai, message) | US-057 |
| SCR-081 | Négociation (contre-offres reçues) | US-058 |
| SCR-082 | Calendrier des rendez-vous | US-059 |
| SCR-083 | Prestation — suivi (états) | US-060 |
| SCR-084 | Prestation — confirmation (pro) | US-060 |
| SCR-085 | Revenus (solde, retrait, historique) | US-062 |
| SCR-086 | Statistiques (missions, taux, annulations) | US-061 |
| SCR-087 | Mon Trust Score (facteurs détaillés) | US-092 |
| SCR-088 | Avis reçus (répondre) | US-041, US-061 |
| SCR-089 | Messages (listes + conversation) | US-046 |
| SCR-090 | Profil pro — aperçu public | US-091 |

## 3. Écrans — App Livreur (P2)

| SCR | Écran | US liées |
|---|---|---|
| SCR-100 | Inscription + validation livreur | US-071 |
| SCR-101 | Statut en ligne / hors ligne | US-072 |
| SCR-102 | Missions disponibles | US-073 |
| SCR-103 | Course en cours (étapes) | US-073 |
| SCR-104 | Navigation GPS | US-073 |
| SCR-105 | Preuve de livraison (photo) | US-074 |
| SCR-106 | Gains et historique | US-075 |

## 4. Écrans — Restaurant (P2)

| SCR | Écran | US liées |
|---|---|---|
| SCR-110 | Fiche restaurant (menu, photos, horaires) | US-076 |
| SCR-111 | Panier / commande | US-077 |
| SCR-112 | Suivi de commande temps réel | US-078 |

## 5. Écrans — Web Admin (P0)

| SCR | Écran | US liées |
|---|---|---|
| SCR-120 | Connexion admin (2FA) | — |
| SCR-121 | Dashboard (KPIs, pays) | US-084 |
| SCR-122 | File de validation (dossiers pro) | US-081 |
| SCR-123 | File de modération (avis, contenus) | US-082 |
| SCR-124 | Litiges (arbitrage) | US-083 |
| SCR-125 | Signalements | US-082 |
| SCR-126 | Utilisateurs (recherche, suspendre/bannir) | US-085 |
| SCR-127 | Paiements (transactions, reversements) | — |
| SCR-128 | Statistiques (nationales, par pays) | US-084 |
| SCR-129 | Paramètres plateforme (pays, catégories, devises) | — |

---

## 6. Dialogues (modaux)

| Dialog | Contexte | Action critique |
|---|---|---|
| DLG-001 | Confirmation de déconnexion | Oui/Non |
| DLG-002 | Confirmation d'annulation d'une demande | Oui/Non + motif |
| DLG-003 | Confirmation de sélection d'un devis | Oui/Non (irréversible) |
| DLG-004 | Confirmation d'envoi de devis | Oui/Non |
| DLG-005 | Confirmation d'annulation de rendez-vous | Oui/Non |
| DLG-006 | Confirmation de paiement (montant) | Oui/Non + mode |
| DLG-007 | Erreur générique (réessayer) | Action unique |
| DLG-008 | Session expirée (reconnexion) | Action unique |
| DLG-009 | Consentement (CGU / vie privée / marketing) | Accepter / Refuser |
| DLG-010 | Suppression de compte (RGPD, 2 étapes) | Destructif |
| DLG-011 | Signalement (choix du motif) | Envoyer / Annuler |
| DLG-012 | Réouverture d'une demande annulée | Oui/Non |
| DLG-013 | Permission GPS refusée (explication + réglages) | Action unique |
| DLG-014 | Permission notifications refusée | Action unique |
| DLG-015 | Litige : confirmation d'ouverture | Oui/Non |

## 7. Bottom Sheets

| Sheet | Contexte |
|---|---|
| BTS-001 | Filtres de recherche (distance, note, prix, dispo) |
| BTS-002 | Tri des résultats (pertinence, distance, note) |
| BTS-003 | Choix de la catégorie (arborescence) |
| BTS-004 | Actions sur une demande (annuler, réouvrir, partager) |
| BTS-005 | Moyens de paiement (MoMo, Moov, espèces) |
| BTS-006 | Ajout de photo (caméra / galerie) |
| BTS-007 | Partage d'un pro (WhatsApp, liens) |
| BTS-008 | Options de message (photo, document, position) |
| BTS-009 | Statuts de disponibilité pro (disponible/occupé/en congé) |
| BTS-010 | Choix du créneau (prochaines disponibilités) |

## 8. Wizards (parcours multi-étapes)

| Wizard | Étapes | US |
|---|---|---|
| WIZ-001 | Inscription client : téléphone → OTP → profil → consentements | US-002, US-005 |
| WIZ-002 | Publication de besoin : description+photos → budget+date+adresse → confirmation | US-023, US-024 |
| WIZ-003 | Inscription pro : infos → vérification → services → disponibilités | US-051…US-055 |
| WIZ-004 | Paiement : montant → méthode → confirmation → statut | US-032 |
| WIZ-005 | Avis : note globale → 4 critères → commentaire → photos | US-041…US-043 |
| WIZ-006 | Litige : type → description → preuves → confirmation | US-035 |
| WIZ-007 | Livreur (P2) : infos → véhicule → documents → validation | US-071 |

## 9. Notifications push

| Type | Déclencheur | Cible |
|---|---|---|
| NT-001 | Nouveau devis reçu | Client |
| NT-002 | Contre-offre reçue | Client / Pro |
| NT-003 | Devis sélectionné (victoire) | Pro |
| NT-004 | Devis non retenu | Pro |
| NT-005 | Nouveau message | Les deux |
| NT-006 | Rappel de rendez-vous (J-1) | Client |
| NT-007 | Rappel de rendez-vous (H-1) | Pro |
| NT-008 | Paiement reçu | Pro |
| NT-009 | Paiement confirmé | Client |
| NT-010 | Prestation à confirmer | Client / Pro |
| NT-011 | Nouvelle demande correspondant à mon métier | Pro |
| NT-012 | Nouvelle demande à proximité | Pro |
| NT-013 | Avis reçu | Pro |
| NT-014 | Profil vérifié (badge accordé) | Pro |
| NT-015 | Dossier de vérification rejeté | Pro |
| NT-016 | Compte suspendu / banni | Utilisateur |
| NT-017 | Nouvelle connexion détectée (sécurité) | Utilisateur |
| NT-018 | Promotion / annonce | Client |
| NT-019 | Course assignée (P2) | Livreur |
| NT-020 | Commande prête / en route (P2) | Client |

## 10. Emails

| Email | Déclencheur |
|---|---|
| EM-001 | Bienvenue (confirmation compte) |
| EM-002 | Vérification du profil réussie |
| EM-003 | Rappel de rendez-vous (J-1) |
| EM-004 | Facture / reçu de paiement |
| EM-005 | Nouveau devis (si email activé) |
| EM-006 | Export de données RGPD (lien de téléchargement) |
| EM-007 | Confirmation de suppression de compte |
| EM-008 | Newsletter (consentement marketing uniquement) |

## 11. SMS

| SMS | Déclencheur |
|---|---|
| SMS-001 | Code OTP (connexion/inscription) |
| SMS-002 | Code OTP (paiement sensible) |
| SMS-003 | Rappel de rendez-vous (si pas de push) |
| SMS-004 | Nouveau devis (canal de repli) |
| SMS-005 | Paiement reçu (pro, canal de repli) |
| SMS-006 | Compte bloqué / sécurité |

## 12. États d'interface (transverses)

Chaque écran de données supporte obligatoirement :

| État | Comportement |
|---|---|
| Chargement | Skeleton (liste) / spinner (action) |
| Vide | Illustration + microcopy + action (ex. "Aucun devis pour l'instant") |
| Erreur | Message clair + bouton Réessayer |
| Hors-ligne | Bandeau + données en cache ; envoi différé (messages) |
| Succès | Confirmation visible (snackbar / écran de succès) |
| Rafraîchissement | Pull-to-refresh systématique sur les listes |
| Expiration session | Dialog → reconnexion silencieuse si refresh valide |
| Permission refusée | Dialog explicatif + bouton vers réglages |

---

## 13. Total inventaire

- **35 écrans Client** + **21 écrans Pro** + **7 Livreur** + **3 Restaurant** + **10 Admin** = **76 écrans**
- **15 dialogues**, **10 bottom sheets**, **7 wizards**
- **20 notifications push**, **8 emails**, **6 SMS**
- **8 états d'interface transverses**

Le périmètre MVP (P0) couvre : écrans Client (35), Pro (21), Admin (10), tous les
dialogues/sheets/wizards associés. Livreur/Restaurant = Phase 2.
