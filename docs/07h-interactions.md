# 3.6 bis — Design des interactions (TCHATCHA)

Document de référence de toutes les interactions. Homogénéité garantie sur toute
l'application. Consomme les tokens `motion.*` (07d). Toute interaction décrite ici
est un contrat : le code doit l'implémenter tel quel.

---

## 1. Gestes (app mobile)

| Geste | Effet | Où | Règle |
|---|---|---|---|
| **Tap** | Action primaire (navigation, bouton, carte) | Partout | Zone ≥ 48×48 ; feedback immédiat : press (fond assombri + scale 0.98, 100 ms) |
| **Long press** | Actions contextuelles (menu) | Cartes pro, messages, favoris | Haptic léger à 300 ms ; menu bottom sheet |
| **Double tap** | Favori rapide (cœur) | Fiches pro, résultats | Cœur animé (pop 200 ms) + snackbar « Ajouté aux favoris » |
| **Swipe (liste)** | Actions secondaires | Conversations, notifications | Swipe reveal : gauche = supprimer/archiver (fond error), droite = lire/épingler |
| **Swipe (carrousel)** | Photos portfolio, catégories | Fiches, accueil | Carrousel avec snap ; indicateur de page |
| **Swipe back** | Retour | Écrans empilés (iOS) | Suit la navigation ; interruptible ; on y reviendra |
| **Pull-to-refresh** | Rafraîchir | Toutes les listes | Skeleton du contenu existant conservé, spinner ; délai min 300 ms (anti flot) |
| **Drag (web)** | Réordonner | Admin (zones, catégories) | Drag & drop avec ombre portée ; drop = animation d'insertion |
| **Pinch / zoom** | Carte, photos | Carte, gallery | Zoom 1×–4× photos ; carte limitée au zoom MapLibre |

Règles : jamais de double action sur un même élément (tap ≠ long press simultanés) ;
tous les gestes ont un équivalent accessible (boutons visibles).

## 2. Cartes (cards)

| Interaction | Animation | Règle |
|---|---|---|
| Expansion | Hauteur fluide 250 ms, contenu fade 150 ms | Cards repliables : « Voir plus » (portfolio, description) |
| Collapse | Inverse | Toujours un indice visuel (chevron rotate 180°) |
| Apparition en liste | Fade + translateY 12 px, 200 ms, stagger 40 ms | Premier chargement seulement (pas à chaque scroll) |
| Presse | Scale 0.98 + assombrissement 100 ms | Feedback systématique |
| Entrée en favori | Pop du cœur (scale 1.4 → 1, 200 ms) | Haptique léger |

## 3. Animations & transitions

| Transition | Durée | Curbe | Usage |
|---|---|---|---|
| Push (navigation) | 300 ms | ease | Écran suivant (slide X) |
| Fade | 250 ms | ease | Changer d'onglet de contenu |
| Bottom sheet | 280 ms | ease.enter / ease.exit | Monter / descendre |
| Modal | 200 ms | ease.enter | Scale 0.96 → 1 + fade |
| Hero (avatar pro) | 350 ms | ease | Fiche pro ← résultats : l'avatar "vole" |
| Hero (photo besoin) | 350 ms | ease | Galerie plein écran |
| Badge de confiance | 400 ms | ease.enter | Apparition du badge (première vue) |
| Succès plein écran | 400 ms | ease.enter | Check dessiné (stroke, 300 ms) puis contenu |
| Erreur inline | 150 ms | ease | Slide du message sous le champ |
| Skeleton→contenu | 250 ms | fade | Remplacer skeleton par contenu |

Règle : `prefers-reduced-motion` → toutes ces animations deviennent ≤ 100 ms ou un simple fade.

## 4. Navigation

| Mécanisme | Comportement |
|---|---|
| Push (route) | Empile ; AppBar back + swipe back (iOS) ; Android : geste système |
| Pop | Retour ; si formulaire modifié → dialog « Abandonner ? » (DLG-009) |
| Modal | Bloquant, tap scrim = fermer si action non destructive, sinon bouton explicite |
| Bottom sheet | Tap scrim = fermer ; hauteur max 90 % ; scroll interne ; bouton primaire collé |
| Tabs (bottom) | 4 onglets max ; état actif = icône + label + pastille (couleur primary) ; transition fade |
| Hero | Systématique entre liste → détail pour les éléments visuels principaux |
| Back gesture | Intercepté si wizard en cours (confirmer abandon) |
| Deep link | Notifications : push → route cible directe ; back = retour à la boîte de notifications |

## 5. Feedback utilisateur

| Retour | Mécanisme |
|---|---|
| Tap | Press visuel (100 ms) |
| Long press / favori / succès critique | Haptique léger (Android : vibration 10 ms ; iOS : impact light) |
| Action en cours | Bouton → spinner 20 px + libellé conservé (« Envoi… ») ; **désactivé** |
| Chargement liste | Skeleton (pas de spinner géant) |
| Progression | LinearProgressIndicator (upload, paiement) + % |
| Succès | Snackbar check vert 4 s ; ou écran plein pour actions majeures (publication, paiement) |
| Erreur | Snackbar erreur 6 s + « Réessayer » ; erreurs de formulaire inline |
| Offline | Bandeau warning persistant ; actions de lecture OK, écriture = file d'attente |
| Vibration erreur | Haplique warning (double pulse) uniquement pour paiement/litige |

## 6. Carte (MapLibre)

| Interaction | Comportement |
|---|---|
| Zoom | Pinch / double tap / boutons + − ; zoom par défaut adapté au rayon (fitBounds) |
| Pins | Tap → popup mini-card (photo, nom, note, distance) → tap = fiche pro |
| Clusters | < 50 px d'écart : cluster rond vert avec compteur ; tap cluster = zoom pour éclater |
| Position utilisateur | Pin orange ; bouton recentrage ; première ouverture = dialog permission (DLG-013) |
| Rayon de recherche | Cercle translucide autour du centre ; drag du centre = nouvelle recherche |
| Itinéraire (P2 livreur) | Tap « Naviguer » → MapLibre + instructions étapes ; suivi temps réel |
| Sélection d'adresse | Long press carte → pin posé → adresse reverse-geocodée en chip éditable |

## 7. Recherche

| Interaction | Comportement |
|---|---|
| Autocomplétion | Debounce 300 ms ; suggestions serveur (catégories + pros) ; 8 max |
| Suggestions | Chips sous la barre : populaires + historiques |
| Historique | 10 dernières recherches locales (stockage local) ; croix pour effacer un item ; « Effacer tout » |
| Recherche vocale (futur) | Bouton micro (P3) ; même pipeline que le texte |
| Recherche récente | Visible au focus (avant frappe) ; tap = relance |
| Filtres | Bottom sheet (BTS-001) ; badges actifs sur la barre ; annulation par chips |

## 8. Upload (médias)

| Étape | Comportement |
|---|---|
| Sélection | Caméra / galerie (BTS-006) ; multi-sélection (max 10, palette 6) |
| Compression | Auto : image ≤ 1280 px, JPEG 85 % ; vidéo ≤ 1080 p ; avant envoi, avec % de progression |
| Prévisualisation | Grille avec vignettes ; tap = aperçu plein écran ; zoom |
| Drag & drop (web) | Zone pointillée + drop ; même pipeline |
| Envoi | En parallèle ; upload S3 signé (ADR-007) ; chaque image : état (en attente / envoi % / ok / échec + réessayer) |
| Annulation | Croix par vignette pendant l'envoi (annule la tâche) |
| Reprise | Échec → bouton « Réessayer » par vignette ; jamais de double envoi (idempotence) |

## 9. Hors-ligne & synchronisation

| Situation | Comportement |
|---|---|
| Déconnexion | Bandeau « Hors ligne » ; lecture du cache (données datées) |
| Écriture hors-ligne | File d'attente locale : messages, devis, avis — statut « En attente » + horodatage |
| Reconnexion | Sync automatique (dans l'ordre) ; notifications de résultat ; conflits → garder les deux (chat) ou le serveur (états) |
| Résolution de conflits | Règle : le serveur fait foi pour les états métier (devis, réservation) ; le client est averti « Le devis a déjà été répondu » |
| Expiration token | Rafraîchissement silencieux ; si échec → dialog reconnexion (DLG-008) |

## 10. Clavier & champs

| Interaction | Comportement |
|---|---|
| Clavier | Ne recouvre jamais le champ actif ; scroll automatique ; bouton « Terminé » |
| Type de clavier | Téléphone : tel ; prix : number ; OTP : number, 6 cases, auto-advance |
| Autofill | OTP : auto-read SMS (si permission) ; code collé = validation immédiate |

## 11. Accessibilité des interactions

- Chaque interaction a un équivalent clavier (web admin) et lecteur d'écran.
- Swipe actions dupliquées par boutons visibles sur long press.
- Aucun geste requis pour l'action principale d'un écran.
