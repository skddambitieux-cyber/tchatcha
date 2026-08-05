# 3.7 — Wireframes basse fidélité — Écrans restants (Client, Pro, Admin)

Mêmes règles que `07i`/`07j` : SCR, objectif, entrées, sorties, actions, états,
erreurs, navigation, US. Sans couleur, sans image. Ce document complète la
couverture 3.7 à 100 % avant le passage aux maquettes 3.8.

---

## FLOW B bis — Recherche & fiche pro (compléments)

### SCR-010 — Filtres (bottom sheet BTS-001)
```
┌──────────────────────────┐  (sheet, glisse depuis le bas)
│  Filtres           [Réinit.]│
│  Distance               │
│  [ 10 km ———————●  ]    │  ← slider (5/10/25/50 km)
│  Note minimum           │
│  [ ★★★★★ ▾ ]            │
│  Prix (FCFA)            │
│  [ min ] – [ max ]      │
│  Disponibilité          │
│  [x] Disponible aujourd'hui
│  [x] Vérifié TCHATCHA   │
│  [x] Livraison à domicile
│  Catégorie              │
│  [ Artisans ▾ ]         │
│  [ Voir 12 résultats ]  │  ← primaire, compteur
└──────────────────────────┘
```
Objectif : affiner la recherche (rayon, note, prix, dispo, catégorie).
Entrées : filtres courants, position.
Sorties : SearchFilters → requête résultats.
Actions : sliders, toggles, réinitialiser, appliquer.
États : bouton « Voir N résultats » mis à jour en direct ; sheet déplaçable.
Erreurs : —.
Navigation : ← SCR-008 ; → SCR-008 (appliqué).
US : US-018, US-019.

### SCR-012 — Fiche pro — Avis
```
┌──────────────────────────┐
│  <  Avis                 │
│  ★ 4,8 (127 avis)        │
│  ┌─────────────────────┐ │
│  │ Qualité    4,9 ████▌│ │  ← barres par critère
│  │ Ponctualité 4,7 ████▍│ │
│  │ Rapport Q/P 4,2 ████▏│ │
│  │ Politesse   4,7 ████▍│ │
│  └─────────────────────┘ │
│  [Tous] [★5] [★4] [★3…] │  ← filtres par note
│  ┌─────────────────────┐ │
│  │ [avatar] Adjo F.     │ │
│  │ ★★★★★ · il y a 3 j  │ │
│  │ « Travail soigné… »  │ │
│  │ [photo avis]         │ │
│  └─────────────────────┘ │
│  …                       │
│  [Signaler un avis]      │  ← DLG-011 (si abusif)
└──────────────────────────┘
```
Objectif : lire les avis détaillés (PRD §11, Trust Score).
Entrées : professional_id.
Sorties : répartition par critère + liste paginée.
Actions : filtres par note, signaler un avis, photos.
États : skeleton liste ; filtre actif en chip.
Erreurs : avis indisponible → état vide.
Navigation : ← SCR-011 ; → SCR-011.
US : US-041…US-044, US-091.

### SCR-013 — Fiche pro — Portfolio
```
┌──────────────────────────┐
│  <  Portfolio             │
│  [Tous] [Avant/Après]     │  ← chips
│  [img][img][img]          │  ← grille 3 col.
│  [img][img][img]          │
│  ┌─────────────────────┐ │
│  │  [video ▶]          │ │  ← vidéo (lecteur inline)
│  └─────────────────────┘ │
│  Tap image → plein écran │  ← viewer + zoom
│  [💬 Demander ce même résultat]
└──────────────────────────┘
```
Objectif : montrer les réalisations (PRD §10).
Entrées : professional_id.
Sorties : galerie + étiquettes avant/après.
Actions : zoom (plein écran, pincer), vidéo, bouton demande.
États : skeleton grille ; lazy load images.
Erreurs : —.
Navigation : ← SCR-011 ; → SCR-019 (besoin pré-rempli).
US : US-054.

### SCR-014 — Fiche pro — Vérifié & Trust Score
```
┌──────────────────────────┐
│  <  À propos de Kossi A. │
│  [✓ Badge Vérifié]       │  ← bandeau explicatif
│  « Identité vérifiée par  │
│    TCHATCHA le 12 juin »  │
│                          │
│  Trust Score              │
│  [ 4,6 / 5 ]  [Niveau HAUT]
│  Missions : 32            │
│  Taux de réponse : 95 %   │
│  Annulations : 2 %        │
│  Litiges : 0              │
│  [Comment est calculé le score ?]
│                          │
│  [ Signaler ce pro ]      │  ← DLG-011
└──────────────────────────┘
```
Objectif : rassurer / alerter (badge + score — PRD §21, US-092).
Entrées : professional_id.
Sorties : détails vérification + facteurs du score.
Actions : info score (sheet explicative), signaler.
États : badge en attente (si non vérifié → « en cours de vérification »).
Erreurs : —.
Navigation : ← SCR-011.
US : US-091, US-092.

---

## FLOW B ter — Notifications, favoris, messagerie

### SCR-015 — Favoris
```
┌──────────────────────────┐
│  <  Mes favoris          │
│  [Pros] [Restaurants(P2)]│
│  ┌─────────────────────┐ │
│  │ [img] Carreleur      │ │
│  │ Kossi A. ★4,8 · 3 km │ │
│  │ [❤]                  │ │  ← cœur rempli, tap retire
│  └─────────────────────┘ │
│  [card] Plombier · …     │
│  …                       │
│  [Trier : récents ▾]     │
└──────────────────────────┘
```
Objectif : retrouver ses pros (US-013).
Entrées : user_id.
Sorties : liste pros favoris.
Actions : tap → fiche (SCR-011), cœur → retirer, trier.
États : vide → illustration + CTA « Découvrir des pros ».
Erreurs : —.
Navigation : ← profil (SCR-032) ; → SCR-011.
US : US-013.

### SCR-016 — Notifications
```
┌──────────────────────────┐
│  <  Notifications        │
│  [Toutes] [Non lues (3)] │
│  ┌─────────────────────┐ │
│  │ ● Nouveau devis      │ │  ← pastille non lue
│  │ Kossi A. a répondu à │ │
│  │ votre demande        │ │
│  │ il y a 5 min         │ │
│  └─────────────────────┘ │
│  [ NT-001 / deep link →  │  ← tap ouvre l'écran cible
│    SCR-023 ]             │
│  [NT-011] Nouvelle demande (pro)
│  [NT-006] Rappel RDV J-1 │
│  [Tout marquer comme lu] │
└──────────────────────────┘
```
Objectif : boîte de réception (US-047/048).
Entrées : user_id, périphérique.
Sorties : liste paginée + statut lu/non lu.
Actions : tap → écran cible (deep link), marquer lu, « tout lu ».
États : non lues en tête ; bandeau offline.
Erreurs : —.
Navigation : ← SCR-005 (icône cloche) ; → écrans cibles.
US : US-047, US-048.

### SCR-017 — Messagerie — liste des conversations
```
┌──────────────────────────┐
│  <  Messages             │
│  [ 🔍 rechercher… ]      │
│  ┌─────────────────────┐ │
│  │ [avatar] Kossi A.    │ │
│  │ Carrelage 150 m²     │ │
│  │ D'accord, à demain ✔ │ │
│  │ 09:12  ●              │ │  ← ● non lu
│  └─────────────────────┘ │
│  [conv] Adjo F. · …      │
│  [conv] Resto Chez Mama  │
│  [Filtrer : liés à une demande ▾]
└──────────────────────────┘
```
Objectif : lister les échanges (US-046).
Entrées : user_id.
Sorties : conversations triées (dernier message, non lues d'abord).
Actions : recherche, tap → conversation, filtre.
États : vide → CTA « Démarrer avec un pro ».
Erreurs : —.
Navigation : ← onglet Messages (tab) ; → SCR-018.
US : US-046.

### SCR-018 — Conversation
```
┌──────────────────────────┐
│  <  Kossi A.             │
│  [✓ Vérifié] · réponse ~20 min
│  ─────────────────────   │
│  < Demande liée :         │
│  [Carrelage 150 m² ▸]    │  ← contextual card
│  ─────────────────────   │
│  09:00  Bonjour, j'ai    │
│  bien reçu votre besoin. │
│  09:02  Je passe demain  │
│  à 14h pour estimer.     │
│  ─────────────────────   │
│  [📷][📎][📍]  [ Message… ][➤]
│  [ Envoyer ] (mobile : icône)
└──────────────────────────┘
```
Objectif : discuter avec contexte (US-046).
Entrées : conversation_id.
Sorties : messages + mises à jour temps réel.
Actions : envoyer texte, photo (BTS-008), document, position ; card → SCR-022.
États : bulles (moi/droite, lui/gauche) ; « vu ✔✔ » ; brouillon local hors-ligne.
Erreurs : envoi échoué → réessayer ; hors-ligne → file d'attente + bandeau.
Navigation : ← SCR-017 ; → SCR-022 (demande liée), SCR-011.
US : US-046.

---

## FLOW D bis — Fin de prestation & litige

### SCR-029 — Prestation — Confirmation (client, après double confirmation)
```
┌──────────────────────────┐
│  [✓ animation]           │
│  Prestation confirmée !  │
│                          │
│  Kossi A. a confirmé de  │
│  son côté. Le paiement   │
│  de 200 000 FCFA a été   │
│  libéré.                 │
│                          │
│  [ Noter Kossi A. ]      │  ← primaire
│  [ Plus tard ]           │
└──────────────────────────┘
```
Objectif : valider la fin + libérer le paiement (US-034).
Entrées : booking_id (double confirmation reçue).
Sorties : statut COMPLETED + transaction libérée.
Actions : noter (SCR-031), plus tard.
États : succès animé ; rappel de notation (push NT-013 côté pro, NT-010 côté client).
Erreurs : —.
Navigation : ← SCR-028 ; → SCR-031 / SCR-005.
US : US-034, US-032.

### SCR-030 — Litige (wizard WIZ-006)
```
┌──────────────────────────┐
│  <  Ouvrir un litige     │  Étape 1/3
│  Type de problème        │
│  ( ) Travail non conforme
│  ( ) Travail non terminé │
│  ( ) Retard / non venue  │
│  ( ) Problème de paiement│
│  ( ) Autre               │
│  [ Continuer ]           │
└──────────────────────────┘
```
```
┌──────────────────────────┐  Étape 2/3
│  <  Décrivez le problème │
│  [ … ]                   │  ← max 1500 car.
│  Preuves (photos)        │
│  [+][+]                  │  ← max 5
│  [ Continuer ]           │
└──────────────────────────┘
```
```
┌──────────────────────────┐  Étape 3/3
│  <  Confirmer            │
│  Résumé :                │
│  · Travail non terminé   │
│  · 2 photos              │
│  Le pro sera notifié et  │
│  l'équipe TCHATCHA       │
│  arbitrera sous 72 h.    │
│  Le paiement est gelé.   │
│  [ Ouvrir le litige ]    │  ← DLG-015
└──────────────────────────┘
```
Objectif : signaler un problème (US-035, protection).
Entrées : booking, type, description, preuves.
Sorties : litige OPEN (statut DISPUTED, paiement gelé).
Actions : type, description, upload preuves, confirmer.
États : stepper ; paiement gelé affiché.
Erreurs : description requise ; preuves optionnelles.
Navigation : ← SCR-028 ; → SCR-022 (statut litige) — admin : SCR-124.
US : US-035.

---

## FLOW E bis — Profil, paramètres, RGPD, aide

### SCR-032 — Profil client
```
┌──────────────────────────┐
│  <  Profil               │
│  [avatar] Amina          │
│  +229 61 23 45 67        │
│  [Modifier]              │
│  ─────────────────────   │
│  Mes activités           │
│  ▶ Mes demandes          │  → SCR-022
│  ▶ Mes favoris           │  → SCR-015
│  ▶ Mes avis              │
│  ▶ Mes adresses          │
│  ─────────────────────   │
│  ▶ Notifications         │  → SCR-016
│  ▶ Paramètres            │  → SCR-033
│  ▶ Aide & support        │  → SCR-035
│  ▶ À propos de TCHATCHA  │
│  ─────────────────────   │
│  [ Se déconnecter ]      │  ← DLG-001
└──────────────────────────┘
```
Objectif : hub compte client (US-011/012).
Entrées : user_id.
Sorties : liste d'accès.
Actions : navigation, modifier profil, déconnexion.
États : avatar initial si pas de photo.
Erreurs : —.
Navigation : ← tab Profil ; → toutes les sections.
US : US-011, US-012.

### SCR-033 — Paramètres
```
┌──────────────────────────┐
│  <  Paramètres           │
│  Langue                  │
│  [ Français ▾ ]          │  ← + relance locale
│  Pays                    │
│  [ Bénin ▾ ]             │
│  Notifications           │
│  [x] Devis et messages   │
│  [x] Rappels RDV         │
│  [x] Offres et promos    │
│  [ Bouton test push ]    │
│  Confidentialité         │
│  [x] Visible dans la recherche
│  ▶ Consentements         │  → DLG-009 ré-éditable
│  ▶ Données personnelles  │  → SCR-034
│  ▶ Supprimer mon compte  │  → DLG-010 (destructif, 2 étapes)
└──────────────────────────┘
```
Objectif : préférences (US-004/005/014).
Entrées : préférences utilisateur.
Sorties : préférences persistées.
Actions : toggles, changement langue/pays, test push, consentements.
États : changement langue → rechargement immédiat de l'UI.
Erreurs : —.
Navigation : ← SCR-032 ; → SCR-034.
US : US-004, US-005, US-014.

### SCR-034 — RGPD — Données personnelles
```
┌──────────────────────────┐
│  <  Données personnelles │
│  Vos droits (loi 2017-20 │
│  Bénin / RGPD) :         │
│                          │
│  [ Exporter mes données ]│  ← EM-006 (lien, 72 h)
│  Formats : JSON / PDF    │
│                          │
│  [ Anonymiser mon compte ]│  ← poste 3 ans inactif,
│                            ← documenté (ajustement 6)
│  ─────────────────────   │
│  ⚠ Supprimer mon compte  │
│  [ Supprimer… ]          │  ← DLG-010 (2 étapes,
│                            ← saisir mot de passe)
│  Vos données :           │
│  · stockées au Bénin     │
│  · jamais revendues      │
│  · suppression effective  │
│    après 30 jours        │
└──────────────────────────┘
```
Objectif : exercer ses droits (US-015).
Entrées : user_id.
Sorties : job export (emails), anonymisation, suppression planifiée.
Actions : exporter, anonymiser, supprimer.
États : demande d'export → confirmation ; suppression → compte INACTIVE puis purge.
Erreurs : mot de passe erroné (suppression).
Navigation : ← SCR-033.
US : US-015.

### SCR-035 — Aide & support
```
┌──────────────────────────┐
│  <  Aide & support       │
│  [ 🔍 rechercher… ]      │
│  Questions fréquentes    │
│  ▶ Comment fonctionne le paiement ?
│  ▶ Que faire si le pro ne vient pas ?
│  ▶ Comment obtenir le badge vérifié ?
│  ▶ Quels sont les frais ?
│  ─────────────────────   │
│  [ Discuter avec le support ]  → SCR-018
│  [ Appeler ]  (+229 …)   │
│  [ Écrire un email ]     │
│  Horaires : 8h–20h · 7j/7│
└──────────────────────────┘
```
Objectif : réduire le support entrant (US —).
Entrées : texte de recherche.
Sorties : réponses FAQ (contenu édité).
Actions : FAQ, support (chat/appel/email).
États : recherche interne FAQ.
Erreurs : —.
Navigation : ← SCR-032.
US : —.

---

## FLOW G bis — Pro (compléments)

### SCR-084 — Prestation — Confirmation (pro)
```
┌──────────────────────────┐
│  <  Mission              │
│  [✓ animation]           │
│  Mission terminée !      │
│  En attente de la        │
│  confirmation du client  │
│  pour libérer 200 000 F. │
│                          │
│  [ Retour au planning ]  │
└──────────────────────────┘
```
Objectif : première confirmation (US-060, double confirmation).
Entrées : booking.
Sorties : COMPLETION_REQUESTED → paiement en attente client.
Actions : retour planning.
États : rappel si le client ne confirme pas (NT-010) ; libération auto après délai (règle).
Erreurs : —.
Navigation : ← SCR-083 ; → SCR-082.
US : US-060.

### SCR-087 — Mon Trust Score
```
┌──────────────────────────┐
│  <  Mon Trust Score      │
│  [ 4,6 / 5 ]  [Niveau HAUT]
│  ┌─────────────────────┐ │
│  │ Qualité avis   4,9 ████▌│
│  │ Ponctualité    4,7 ████▍│
│  │ Réponse        20 min │
│  │ Acceptation    78 %   │
│  │ Annulation     2 %    │
│  │ Litiges        0      │
│  └─────────────────────┘ │
│  Améliorations           │
│  [ › Répondre plus vite aux demandes ]
│  [ › Confirmer les RDV 24h avant ]
│  [ › Ajouter des photos avant/après ]
└──────────────────────────┘
```
Objectif : comprendre le score (US-092).
Entrées : métriques.
Sorties : facteurs + conseils.
Actions : conseils → actions directes (ex. ouvrir planning).
États : non calculé < 5 missions.
Erreurs : —.
Navigation : ← SCR-086.
US : US-092.

### SCR-088 — Avis reçus
```
┌──────────────────────────┐
│  <  Mes avis             │
│  ★ 4,8 · 127 avis        │
│  [Tous] [★5] [★4] [★3…] │
│  ┌─────────────────────┐ │
│  │ [avatar] Adjo F.     │ │
│  │ ★★★★★ · il y a 3 j  │ │
│  │ « Travail soigné… »  │ │
│  │ [Répondre] [Signaler]│ │
│  └─────────────────────┘ │
│  Réponse publiée :       │
│  « Merci Adjo ! »        │  ← réponse du pro
└──────────────────────────┘
```
Objectif : répondre aux avis (US-041, US-061).
Entrées : professional_id.
Sorties : avis + réponses.
Actions : répondre (1 réponse max), signaler.
États : skeleton ; filtres.
Erreurs : —.
Navigation : ← SCR-086 ; → SCR-018 (répondre ? non : éditeur inline).
US : US-041, US-061.

### SCR-089 — Messages (pro)
```
┌──────────────────────────┐
│  <  Messages             │
│  [Toutes] [Demandes] [Prestations]
│  ┌─────────────────────┐ │
│  │ [avatar] Adjo F.     │ │
│  │ Pose carrelage       │ │
│  │ On a dit 14h ✔       │ │
│  │ 08:40  ●             │ │
│  └─────────────────────┘ │
│  [conv liée à une demande ▸]
│  [conv liée à une mission ▸]
└──────────────────────────┘
```
Objectif : lister les échanges pro (US-046).
Entrées : professional_id.
Sorties : conversations + contexte (demande/mission liée).
Actions : tap → conversation (même gabarit SCR-018), filtres.
États : non lues en tête.
Erreurs : —.
Navigation : ← SCR-077 ; → SCR-018 (gabarit conversation).
US : US-046.

### SCR-090 — Aperçu public de mon profil
```
┌──────────────────────────┐
│  Aperçu — comme le voit  │
│  un client               │
│  [héro] [avatar] Kossi A.│
│  [✓ Vérifié] Carreleur   │
│  ★ 4,8 (127) · 32 missions
│  À partir de 1 500 F/m²  │
│  [📞] [WhatsApp] [Discuter]
│  [ Demander un devis ]   │
│  Présentation / Portfolio │
│  Avis (extrait)          │
│  [ Modifier mon profil ] │  ← bouton retour édition
└──────────────────────────┘
```
Objectif : voir sa vitrine telle que vue (US-091).
Entrées : professional_id (aperçu).
Sorties : aperçu en lecture seule.
Actions : modifier (retour édition), partager.
États : badge grisé si non vérifié.
Erreurs : —.
Navigation : ← SCR-073/074 ; → SCR-073.
US : US-091.

---

## FLOW H bis — Admin (compléments)

### SCR-120 — Connexion admin (2FA)
```
┌──────────────────────────┐
│  TCHATCHA Admin          │
│  [ logo ]                │
│  Email *                 │
│  [ admin@tchatcha.bj ]   │
│  Mot de passe *          │
│  [ •••••••• ]            │
│  [ Continuer ]           │
│  ─────────────────────   │
│  Code 2FA (TOTP)         │
│  [ _ ][ _ ][ _ ][ _ ][ _ ][ _ ]
│  [ Valider ]             │
│  · Session à durée courte
│  · Actions sensibles → confirmation
└──────────────────────────┘
```
Objectif : authentification renforcée (ADR-022, anti-fraude).
Entrées : email, mot de passe, TOTP.
Sorties : session admin (rôle, journalisée).
Actions : saisie, valider.
États : 2 étapes ; verrouillage après échecs.
Erreurs : code erroné → « Il vous reste N essais ».
Navigation : → SCR-121.
US : —.

### SCR-123 — File de modération (avis & contenus)
```
┌──────────────────────────┐
│  <  Modération (8)       │
│  [Avis] [Portfolios] [Messages]
│  ┌─────────────────────┐ │
│  │ ★★★☆☆ « Pro pas sérieux »│
│  │ Pro : Kossi A.       │ │
│  │ Signalé par Adjo F.  │ │
│  │ [Voir le contexte]   │ │
│  │ [Masquer] [Ignorer]  │ │
│  └─────────────────────┘ │
│  ┌─────────────────────┐ │
│  │ [img] portfolio      │ │
│  │ suspect (médical)    │ │
│  │ [Masquer] [Ignorer]  │ │
│  └─────────────────────┘ │
└──────────────────────────┘
```
Objectif : garder la marketplace saine (US-082).
Entrées : signalements + file IA (P3).
Sorties : décision + audit + notification.
Actions : masquer, ignorer, voir contexte.
États : compteurs par type ; pagination.
Erreurs : —.
Navigation : ← SCR-121 ; → SCR-012 (avis), SCR-011 (pro).
US : US-082.

### SCR-125 — Signalements
```
┌──────────────────────────┐
│  <  Signalements (8)     │
│  [Tous] [Pros] [Utilisateurs] [Contenus]
│  ┌─────────────────────┐ │
│  │ [avatar] Pro X       │ │
│  │ Motif : arnaque      │ │
│  │ 3 signalements       │ │
│  │ [Voir le profil]     │ │
│  │ [Avertir] [Suspendre]│ │
│  └─────────────────────┘ │
│  ┌─────────────────────┐ │
│  │ [avatar] Client Y    │ │
│  │ Motif : comportement │ │
│  │ [Avertir] [Suspendre]│ │
│  └─────────────────────┘ │
└──────────────────────────┘
```
Objectif : traiter les signalements (US-082, seuils automatiques).
Entrées : signalements.
Sorties : avertissement / suspension (→ NT-016).
Actions : avertir, suspendre (motif), voir profil.
États : compteur de signalements par cible ; seuil → file prioritaire.
Erreurs : —.
Navigation : ← SCR-121 ; → SCR-126, SCR-011.
US : US-082.

### SCR-126 — Utilisateurs
```
┌──────────────────────────┐
│  <  Utilisateurs         │
│  [ 🔍 téléphone / nom… ] │
│  [Filtre : rôle ▾] [statut ▾]
│  ┌─────────────────────┐ │
│  │ +229 61 23 45 67     │ │
│  │ Amina · Client       │ │
│  │ ACTIVE · créé 01/07  │ │
│  │ [Voir] [Suspendre]   │ │
│  └─────────────────────┘ │
│  ┌─────────────────────┐ │
│  │ +229 97 00 11 22     │ │
│  │ Kossi A. · Pro       │ │
│  │ SUSPENDED · 1 litige │ │
│  │ [Voir] [Réactiver]   │ │
│  └─────────────────────┘ │
└──────────────────────────┘
```
Objectif : recherche + suspension/bannissement (US-085).
Entrées : recherche, filtres.
Sorties : profil, historique, actions de modération.
Actions : voir, suspendre (motif + durée), réactiver, bannir (DLG).
États : statuts colorés ; historique des sanctions visible.
Erreurs : —.
Navigation : ← SCR-121/125 ; → SCR-011 (aperçu pro).
US : US-085.

### SCR-127 — Paiements
```
┌──────────────────────────┐
│  <  Transactions         │
│  [BJ ▾] [Aujourd'hui ▾]  │
│  Volume : 2,4 M FCFA     │
│  ┌─────────────────────┐ │
│  │ +200 000 · MoMo      │ │
│  │ Kossi A. ← Amina     │ │
│  │ SUCCESS · 09:12      │ │
│  │ [Détails]            │ │
│  └─────────────────────┘ │
│  ┌─────────────────────┐ │
│  │ 200 000 · retrait    │ │
│  │ Kossi A. · MoMo      │ │
│  │ PENDING · 11:02      │ │
│  │ [Détails] [Relancer] │ │
│  └─────────────────────┘ │
│  [Export CSV]            │
└──────────────────────────┘
```
Objectif : supervision des flux d'argent (revenus plateforme).
Entrées : filtres (pays, période, statut).
Sorties : liste transactions + volume.
Actions : détails (webhook, logs), relancer, export.
États : statuts SUCCESS/PENDING/FAILED ; icônes par moyen de paiement.
Erreurs : —.
Navigation : ← SCR-121.
US : —.

### SCR-129 — Paramètres plateforme
```
┌──────────────────────────┐
│  <  Paramètres           │
│  Pays actifs             │
│  [Bénin (BJ)] [Ajouter]  │  → ADR-013 (géographie)
│  Devises                 │
│  [FCFA (XOF)] [Ajouter]  │
│  Catégories              │
│  [Artisans ▸] [Maison ▸] │  → arbre éditable
│  Commission plateforme   │
│  [ 10 % ] (par catégorie)│
│  Délai d'expiration      │
│  demandes : [ 48 ] h     │
│  [ Périodes de gel paiement ▸ ]
│  Seuils de signalement   │
│  [ 3 ] avant suspension  │
└──────────────────────────┘
```
Objectif : configurer la plateforme (pays, devises, règles).
Entrées : configuration.
Sorties : config versionnée + audit.
Actions : éditer, ajouter pays/catégorie, ajuster seuils.
États : changements → publication (bascule propre).
Erreurs : conflit de devise/pays → avertissement.
Navigation : ← SCR-121.
US : —.

---

## Couverture 3.7 — état final

| Groupe | Document | Écrans couverts |
|---|---|---|
| Client | `07i-wireframes.md` | SCR-001-009, 011, 019-028, 031 |
| Client (compléments) | `07k` (ce document) | SCR-010, 012-018, 029-030, 032-035 |
| Pro | `07j-wireframes-pro-admin.md` | SCR-070-083, 085-086 |
| Pro (compléments) | `07k` | SCR-084, 087-090 |
| Admin | `07j-wireframes-pro-admin.md` | SCR-121, 122, 124, 128 |
| Admin (compléments) | `07k` | SCR-120, 123, 125-127, 129 |
| Phase 2 | — (reportées) | SCR-100-106, 110-112 |

**Couverture MVP : 66 écrans sur 66 (100 %).**
Prochaine étape : maquettes 3.8 traçables US → écran, en attendant la validation.
