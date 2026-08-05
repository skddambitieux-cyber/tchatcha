# 3.7 — Wireframes basse fidélité — App Client

Méthodologie stricte (bug.md) : un user flow = une suite de wireframes ; chaque
wireframe porte : identifiant SCR, objectif, entrées, sorties, actions, états,
erreurs, navigation, User Story liée. **Aucune couleur, aucune image** —
structure, hiérarchie, espacement, navigation uniquement.

Format de chaque fiche :

```
[SCR-XXX] — Titre
Objectif :        …
Entrées :         …
Sorties :         …
Actions :         …
États :           …
Erreurs :         …
Navigation :      ← / →
US :              US-XXX
```

---

## FLOW A — Découverte, inscription et connexion

### SCR-001 — Splash / Onboarding
```
┌──────────────────────────┐
│  [logo TCHATCHA]         │  ← centré, taille grande
│                          │
│  1/3  ● ○ ○              │  ← indicateur (3 étapes)
│                          │
│  Trouvez le bon pro,     │
│  près de chez vous       │  ← titre 28
│  [ Illustration ]        │  ← zone vide (illustration)
│  Bienvenue !             │
│                          │
│  [ Continuer        ]    │  ← bouton primaire plein
│  [ Se connecter     ]    │  ← bouton ghost
└──────────────────────────┘
```
Objectif : présenter la promesse, amorcer l'inscription ou la connexion.
Entrées : aucune (première ouverture) ; langue/pays choisis au SCR-002.
Sorties : choix : Continuer (onboarding 2/3) ou Se connecter (SCR-003).
Actions : tap boutons ; skip onboarding.
États : loading logo (splash 800 ms).
Erreurs : —.
Navigation : → SCR-002, → SCR-003.
US : US-001.

### SCR-002 — Choix langue + pays
```
┌──────────────────────────┐
│  <  Langue & pays        │
│                          │
│  [ 🇫🇷 Français   ✓ ]    │  ← liste radios
│  [ 🇬🇧 English     ]     │
│                          │
│  Pays (modifiable)       │
│  [ Bénin  (BJ)      ]    │  ← sélecteur pays
│                          │
│  [ Continuer        ]    │
└──────────────────────────┘
```
Objectif : configurer la langue et le pays (base de tout le reste).
Entrées : langue, pays.
Sorties : préférences locales + pays (header API).
Actions : sélection, Continuer.
États : défaut = langue système, pays détecté (SIM/GPS) sinon Bénin.
Erreurs : —.
Navigation : ← SCR-001 ; → SCR-004 (inscription) ou SCR-003 (connexion).
US : US-004.

### SCR-003 — Connexion (téléphone + OTP)
```
┌──────────────────────────┐
│  Content de vous revoir  │
│                          │
│  Téléphone               │
│  [ +229  [61 23 45 67] ] │  ← champ composé
│                          │
│  [ Recevoir le code ]    │
│                          │
│  Code à 6 chiffres       │
│  [ _ ][ _ ][ _ ][ _ ][ _ ][ _ ]  ← auto-advance
│                          │
│  Renvoyer le code : 0:45 │  ← compte à rebours
│  [ Se connecter     ]    │  ← activé si OTP valide
│  [ Créer un compte  ]    │  ← lien
└──────────────────────────┘
```
Objectif : authentifier par OTP.
Entrées : téléphone, code OTP.
Sorties : session JWT (access + refresh), user.
Actions : envoyer OTP, saisir code, renvoyer, se connecter, créer un compte.
États : envoi (spinner bouton), compte à rebours 45 s, OTP 6 cases auto-advance.
Erreurs : téléphone invalide (inline) ; code erroné « Il vous reste N essais » ;
code expiré → bouton renvoyer ; compte verrouillé après échecs.
Navigation : ← SCR-001 ; → SCR-005 (accueil).
US : US-003, US-006, US-008.

### SCR-004 — Inscription (wizard WIZ-001)
```
┌──────────────────────────┐  Étape 1/3
│  Bienvenue chez TCHATCHA │
│  Que voulez-vous faire ? │
│                          │
│  [ Trouver un pro ]      │  ← grande carte (client)
│  [ Proposer mes services ]│  ← grande carte (pro)
│                          │
│  < (étapes)  ● ○ ○       │
└──────────────────────────┘
```
```
┌──────────────────────────┐  Étape 2/3
│  Votre téléphone         │
│  [ +229  [61 23 45 67] ] │
│  [ Recevoir le code ]    │
│  [ _ ][ _ ][ _ ][ _ ][ _ ][ _ ]
└──────────────────────────┘
```
```
┌──────────────────────────┐  Étape 3/3
│  Comment devons-nous     │
│  vous appeler ?          │
│  [ Nom complet        ]  │
│                          │
│  ☐ J'accepte les CGU et la politique de confidentialité
│  ☐ Je veux recevoir les offres (optionnel)
│                          │
│  [ Créer mon compte ]    │
└──────────────────────────┘
```
Objectif : créer un compte (client ou pro) avec consentements.
Entrées : rôle, téléphone, OTP, nom, consentements.
Sorties : user créé (statut ACTIVE), session.
Actions : choix rôle, OTP, toggles consentements (bouton bloqué sans CGU), créer.
États : wizard avec progression sauvegardée ; toast après inscription.
Erreurs : téléphone déjà utilisé (« Ce numéro a déjà un compte — connectez-vous »),
OTP invalide, consentement obligatoire signalé.
Navigation : ← SCR-002 ; → SCR-005 (client) / SCR-070 (pro).
US : US-002, US-005, US-051.

---

## FLOW B — Accueil, recherche et carte

### SCR-005 — Accueil
```
┌──────────────────────────┐
│  [avatar] Bonjour, Amina  │  ← en-tête, heure locale
│  [loupe] [……Champ recherche…] [filtres]
│                          │
│  Catégories (horizontal) │
│  [Restauration] [Artisans] [Auto] [Maison] [Santé] [+]  ← chips rondes
│                          │
│  Pros vérifiés           │  ← section
│  [card pro] [card pro]   │  ← carrousel
│                          │
│  Promotions              │
│  [card promo]            │
│                          │
│  Restaurants proches     │  ← section (si géo OK)
│  [card] [card]           │
│                          │
│  Nouveaux prestataires   │
│  [card] [card]           │
└──────────────────────────┘
```
Objectif : accès rapide à la recherche, aux catégories et au contenu chaud.
Entrées : position GPS (optionnelle), profil connecté.
Sorties : liste catégories, pros populaires, promos, restaurants.
Actions : recherche, filtre, catégorie, card → fiche, « Voir tout ».
États : skeleton accueil ; sections en cache ; géo refusée → sections adaptées.
Erreurs : aucune donnée → état vide par section.
Navigation : → SCR-006/007/008/011/110.
US : US-016, US-021, US-022.

### SCR-006 — Catégories
```
┌──────────────────────────┐
│  <  Catégories           │
│  [ 🔍 rechercher… ]      │  ← recherche interne
│                          │
│  ▶ Restauration          │  ← groupes
│     Restaurants · Maquis · Fast-food · Pâtisseries…
│  ▶ Artisans              │
│     Maçons · Carreleurs · Peintres · Soudeurs…
│  ▶ Automobile            │
│     Mécaniciens · Vulcanisateurs · Lavage…
│  ▶ Maison                │
│     Femmes de ménage · Babysitters…
│  ▶ Santé · Éducation · Événementiel · Livraison │
└──────────────────────────┘
```
Objectif : naviguer l'arborescence à 2 niveaux (groupe → sous-catégories).
Entrées : recherche interne.
Sorties : sélection de catégorie.
Actions : tap groupe (expand), tap sous-catégorie → résultats, recherche.
États : groupes repliés par défaut ; un seul ouvert.
Erreurs : aucune catégorie → vide.
Navigation : ← SCR-005 ; → SCR-008 (résultats filtres).
US : US-016.

### SCR-007 — Recherche (focus)
```
┌──────────────────────────┐
│  <  [🔍 ____] [Annuler]  │  ← focus automatique
│                          │
│  Récentes                │  ← historique local
│  [carreleur ⌫] [plombier ⌫]
│  [Effacer tout]          │
│                          │
│  Suggestions             │  ← serveur, debounce 300 ms
│  [Carreleur Cotonou]     │
│  [Plombier Abomey-Calavi]│
│                          │
│  [ 🎤 Recherche vocale ] │  ← futur (P3)
└──────────────────────────┘
```
Objectif : saisir une recherche avec suggestions et historique.
Entrées : texte ; (futur) voix.
Sorties : query normalisée (pays + langue).
Actions : autocomplétion, historique, annuler.
États : suggestions dès 2 caractères ; historique à vide.
Erreurs : —.
Navigation : ← SCR-005 ; → SCR-008.
US : US-016.

### SCR-008 — Résultats de recherche
```
┌──────────────────────────┐
│  < [🔍 carreleur] [carte]│  ← bascule liste/carte
│  12 pros trouvés · 5 km  │
│  [Filtres ▾] [Tri ▾]     │  ← chips
│                          │
│  [card pro]              │  ← photo, nom, badge vérifié,
│  [card pro]              │     note ★, avis, distance, prix
│  [card pro]              │
│  …                       │
│  [Voir sur la carte]     │
└──────────────────────────┘
```
Objectif : comparer les pros (note, distance, prix, badge).
Entrées : query, position, filtres, tri.
Sorties : liste paginée (keyset), meta.
Actions : filtre (BTS-001), tri (BTS-002), card → fiche, carte.
États : skeleton ; chargement infini ; fin de liste.
Erreurs : 0 résultat → état vide avec suggestions d'élargissement.
Navigation : ← SCR-005/007 ; → SCR-009, SCR-011.
US : US-016…US-019, US-091.

### SCR-009 — Carte
```
┌──────────────────────────┐
│  < [🔍 carreleur] [liste]│
│  ┌────────────────────┐  │
│  │      CARTE         │  │  ← pin vert (pro vérifié),
│  │   ● ●              │  │     pin gris, pin orange (moi)
│  │      ⬤(6)          │  │     cluster = rond compteur
│  │ ●        ●         │  │     cercle de rayon
│  │     ●              │  │
│  │  [popup mini-card] │  │  ← tap pin
│  └────────────────────┘  │
│  [ Recentrer ]           │
└──────────────────────────┘
```
Objectif : visualiser la distance et choisir par position.
Entrées : position, query, rayon.
Sorties : sélection d'un pro (popup → fiche).
Actions : zoom, cluster, popup, recentrage, bascule liste.
États : permission GPS refusée → cercle centré manuellement.
Erreurs : pas de résultat dans le rayon → message + bouton élargir.
Navigation : ← SCR-008 ; → SCR-011.
US : US-020.

---

## FLOW C — Publication d'un besoin (US-023)

### SCR-019 — Besoin — Étape 1 : description
```
┌──────────────────────────┐
│  <  Publier un besoin    │
│  ● ○ ○                  │  ← stepper
│                          │
│  Catégorie               │
│  [ Artisans > Carreleur ▾ ]
│                          │
│  Titre *                 │
│  [ Pose de carrelage 150 m² ]  ← max 160 car.
│  Description *           │
│  [ Décrivez le chantier… ]    ← max 2000 car., compteur
│                          │
│  Photos (optionnel)      │
│  [+][+][+][+]            │  ← max 10, upload parallèle
│                          │
│  [ Continuer ]           │  ← désactivé si invalide
└──────────────────────────┘
```
Objectif : décrire le besoin (WIZ-002 étape 1).
Entrées : catégorie, titre, description, photos.
Sorties : brouillon local + uploads S3 (URLs).
Actions : choix catégorie (BTS-003), saisie, upload, Continuer.
États : stepper, compteur, uploads avec % et réessayer.
Erreurs : champs requis signalés ; upload échoué → réessayer ; offline → file d'attente.
Navigation : ← SCR-005 ; → SCR-020 ; brouillon sauvegardé si abandon.
US : US-023, US-024.

### SCR-020 — Besoin — Étape 2 : budget, date, lieu
```
┌──────────────────────────┐
│  <  Publier un besoin    │
│  ○ ● ○                  │
│                          │
│  Budget estimé (optionnel)│
│  [    ] [ FCFA ▾ ] [Par m² ▾]
│                          │
│  Date souhaitée *        │
│  [ 12 sept. ▾ ][ 09:00 ] │
│  Urgence                 │
│  ( ) Normal  ( ) Urgent  │
│                          │
│  Où ? *                  │
│  [📍 Ma position ] [Adresse ▾]
│  [ quartier / commune ▾ ]
│                          │
│  [ Publier le besoin ]   │
└──────────────────────────┘
```
Objectif : compléter budget, date, lieu (WIZ-002 étape 2).
Entrées : budget, date, urgence, adresse/GPS.
Sorties : demande créée (status OPEN), événement.
Actions : sélection date (calendar), position, Publier.
États : validation temps réel ; bouton désactivé si invalide.
Erreurs : lieu manquant ; date passée ; réseau → file.
Navigation : ← SCR-019 ; → SCR-021.
US : US-023, US-024.

### SCR-021 — Besoin — Confirmation + suivi
```
┌──────────────────────────┐
│   [✓ animation check]    │  ← plein écran succès
│   Besoin publié !        │
│   Les pros près de chez  │
│   vous sont notifiés.    │
│                          │
│   Récap : Carrelage 150m²│
│   · 0 devis reçu         │
│   · expire dans 48 h     │
│                          │
│   [ Voir ma demande ]    │  ← primaire
│   [ Retour à l'accueil ] │  ← ghost
└──────────────────────────┘
```
Objectif : confirmer et orienter vers le suivi.
Entrées : id demande.
Sorties : navigation.
Actions : voir la demande (SCR-022), accueil.
États : succès animé 400 ms.
Erreurs : publication échouée → écran erreur + réessayer.
Navigation : → SCR-022, SCR-005.
US : US-023, US-029.

---

## FLOW D — Devis, sélection, paiement

### SCR-022 — Demande — détail et devis reçus
```
┌──────────────────────────┐
│  <  Ma demande           │
│  [ Carrelage 150 m² ]    │  ← titre
│  [● Ouvert]  [expire : 48 h]
│  [ photos… ] [ description ]
│  Lieu : Cotonou · Fidjrossè
│  Budget : 150 000–250 000 FCFA
│                          │
│  Devis reçus (3)         │
│  [card devis]            │  ← pro, note, prix, délai
│  [card devis]            │
│  [card devis]            │
│  [Comparer les devis]    │
│  [Annuler ma demande]    │  ← ghost danger
│  [Rouvrir] (si annulée)  │
└──────────────────────────┘
```
Objectif : suivre l'état et comparer les devis.
Entrées : id demande.
Sorties : statut, liste devis.
Actions : card devis → SCR-023, comparer, annuler (DLG-002), rouvrir (DLG-012).
États : OPEN/QUOTED/NEGOTIATING/SELECTED/… pastille colorée ; skeleton.
Erreurs : demande supprimée → message + retour.
Navigation : ← SCR-021/005 ; → SCR-023.
US : US-025, US-027, US-028, US-029.

### SCR-023 — Devis — détail
```
┌──────────────────────────┐
│  <  Devis de Kossi A.    │
│  [avatar] [✓ Vérifié]    │
│  ★ 4,8 (127 avis) · 32 missions
│  ─────────────────────   │
│  Prix proposé            │
│  [ 200 000 FCFA ]        │  ← money, taille display
│  Délai : 6 jours         │
│  Message :               │
│  « Fourniture incluse… » │
│  ─────────────────────   │
│  [ Choisir ce pro ]      │  ← primaire
│  [ Proposer un prix ]    │  ← outline (contre-offre)
│  [ Discuter ]            │  ← ghost
└──────────────────────────┘
```
Objectif : évaluer un devis.
Entrées : quote_id.
Sorties : décision.
Actions : choisir (DLG-003), contre-offre (SCR-024), discuter.
États : devis retiré → message ; déjà sélectionné → verrou.
Erreurs : —.
Navigation : ← SCR-022 ; → SCR-025/024/018.
US : US-025, US-026, US-027.

### SCR-024 — Négociation (contre-offre)
```
┌──────────────────────────┐
│  <  Négocier             │
│  Devis actuel : 200 000  │
│  Ma proposition :        │
│  [ 180 000    ] FCFA     │
│  Message :               │
│  [ Prix du marché… ]     │
│                          │
│  [ Envoyer ma contre-offre ]
└──────────────────────────┘
```
Objectif : proposer un prix (chaîne de contre-offres).
Entrées : montant, message.
Sorties : quote COUNTERED + notification au pro.
Actions : envoyer (bouton désactivé en cours).
États : historique de négociation affiché (liste montants).
Erreurs : montant invalide / > budget max.
Navigation : ← SCR-023 ; → SCR-022.
US : US-026.

### SCR-025 — Sélection d'un devis
```
┌──────────────────────────┐
│  <  Choisir ce pro ?     │
│  Kossi A. · 200 000 FCFA │
│                          │
│  Ce qui se passe ensuite:│
│  1. Vous réservez un créneau
│  2. Vous payez (MoMo/Moov/espèces)
│  3. Le pro réalise la mission
│  4. Vous confirmez et notez
│                          │
│  [ Confirmer le choix ]  │  ← primaire
│  [ Retour ]              │
└──────────────────────────┘
```
Objectif : confirmer (irréversible) la sélection.
Entrées : quote_id.
Sorties : status SELECTED + événement, autres pros notifiés.
Actions : confirmer, retour.
États : loading.
Erreurs : pro indisponible soudain → message.
Navigation : ← SCR-023 ; → SCR-026 (créneau).
US : US-027.

### SCR-026 — Choix du créneau
```
┌──────────────────────────┐
│  <  Choisir un créneau   │
│  [ ‹ Août 2026 › ]       │  ← calendrier
│  L  M  M  J  V  S  D     │
│  ·  3  4  ✗  6  ·  ·     │  ← ✗ = indisponible
│  ·  ✗  9  10 ✗  ·  ·     │
│  Disponibilités du 6 :   │
│  [08:00] [10:00] [14:00] │  ← chips d'heures
│                          │
│  [ Réserver ce créneau ] │
└──────────────────────────┘
```
Objectif : réserver sans conflit (ajustement 4 du schéma).
Entrées : pro, période.
Sorties : booking CONFIRMED (créneau verrouillé).
Actions : sélection date/heure, réserver.
États : jours indisponibles grisés ; heures réservées masquées.
Erreurs : créneau pris entre-temps → suggestion du suivant.
Navigation : ← SCR-025 ; → SCR-027.
US : US-031.

### SCR-027 — Paiement
```
┌──────────────────────────┐
│  <  Paiement             │
│  Montant : 200 000 FCFA  │
│  À : Kossi A.            │
│                          │
│  Moyen de paiement       │
│  ( ) MTN MoMo  [+229 61…]│
│  ( ) Moov Money          │
│  ( ) Espèces             │
│  [ Enregistré… ]         │
│                          │
│  [ Payer maintenant ]    │
│  (💰 Espèces : payez au  │
│   pro à la fin)          │
└──────────────────────────┘
```
Objectif : régler la prestation (ou choisir espèces).
Entrées : booking, méthode.
Sorties : transaction + événement paiement.
Actions : choisir méthode, payer (DLG-006).
États : paiement en cours (spinner + statut), succès, échec.
Erreurs : échec MoMo → « Aucun montant débité. Réessayez. » + choix autre méthode.
Navigation : ← SCR-026 ; → SCR-028.
US : US-032.

### SCR-028 — Prestation & confirmation
```
┌──────────────────────────┐
│  <  Ma prestation        │
│  [✓ Payée] · Rendez-vous │
│  Kossi A. · 12 sept 09:00│
│  Adresse : Fidjrossè …   │
│  [ Contacter ] [ Itinéraire ]
│                          │
│  Statut                  │
│  ● Confirmé              │
│  ○ En cours              │
│  ○ Terminé               │
│                          │
│  [ Je confirme la prestation terminée ]
│  [ Ouvrir un litige ]    │  ← si payé et problème
└──────────────────────────┘
```
Objectif : suivre et confirmer (double confirmation client/pro).
Entrées : booking_id.
Sorties : confirmation → COMPLETED + paiement libéré au pro.
Actions : confirmer, contacter, litige.
États : timeline 3 étapes ; rappel J-1/H-1.
Erreurs : —.
Navigation : ← SCR-027 ; → SCR-031 (avis).
US : US-033, US-034, US-035.

### SCR-031 — Avis
```
┌──────────────────────────┐
│  <  Votre avis           │
│  Prestation de Kossi A.  │
│                          │
│  Note générale           │
│  [ ★ ★ ★ ★ ☆ ]          │  ← 5 étoiles
│  Ponctualité   [ ★ ★ ★ ★ ☆ ]
│  Qualité       [ ★ ★ ★ ★ ☆ ]
│  Rapport Q/P   [ ★ ★ ★ ★ ☆ ]
│  Politesse     [ ★ ★ ★ ★ ☆ ]
│                          │
│  Commentaire             │
│  [ … ]                   │
│  Photos (optionnel) [+][+]│
│                          │
│  [ Publier mon avis ]    │
└──────────────────────────┘
```
Objectif : noter le pro (5 critères — PRD §11), post-prestation uniquement.
Entrées : booking complété.
Sorties : avis + mise à jour Trust Score.
Actions : noter, commenter, photos, publier.
États : 5 sous-notes obligatoires ; toast succès.
Erreurs : —.
Navigation : ← SCR-028 ; → SCR-005.
US : US-041, US-042, US-043.

---

## FLOW E — Fiche professionnel

### SCR-011 — Fiche professionnel
```
┌──────────────────────────┐
│  [héro photo pro]        │  ← hero vers liste
│  [avatar] Kossi A.       │
│  [✓ Vérifié TCHATCHA]    │  ← badge confiance
│  Carreleur · Cotonou     │
│  ★ 4,8 (127) · 32 missions
│  Répond en ~20 min       │
│  À partir de 1 500 F/m²  │
│  [📞] [WhatsApp] [Discuter] [Demander un devis]
│  ─────────────────────── │
│  Présentation            │
│  15 ans d'expérience…    │
│  Horaires : 8h–18h · dispo aujourd'hui
│  Portfolio               │
│  [img][img][img][img]    │
│  Avis                    │
│  [★ 4,8 · 4,2 · 4,9 · 4,7]│  ← sous-notes
│  [voir les avis]         │
└──────────────────────────┘
```
Objectif : convaincre et engager l'action.
Entrées : professional_id.
Sorties : données fiche (profil, services, portfolio, avis, dispo).
Actions : appeler, WhatsApp, discuter (SCR-018), demander un devis (SCR-019), favori (double tap), avis.
États : badge + Trust Score visibles sans scroll ; dispo calculée (aujourd'hui/maintenant).
Erreurs : pro suspendu → fiche inaccessible.
Navigation : ← SCR-008/009 ; → SCR-018/019/012/013.
US : US-091, US-054.

---

## Navigation globale (App Client)

```
Tabs : [Accueil] [Recherche] [Messages] [Profil]
Routes poussées : catégories, résultats, carte, fiche pro, besoin (wizard),
demande, devis, négociation, créneau, paiement, prestation, avis, litige,
notifications, favoris, paramètres, RGPD, aide.
```
