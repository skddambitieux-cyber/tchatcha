# 3.7 base — Backlog User Stories (TCHATCHA)

Base de traçabilité exigée (3.8) : chaque écran, maquette et test remonte à une US.
Format : `US-XXX — En tant que <rôle>, je souhaite <action> afin de <bénéfice>.`

Priorités : P0 = MVP obligatoire, P1 = MVP si temps, P2 = Phase 2, P3 = Phase 3.

---

## Épic A — Compte & connexion (P0)

| ID | Story |
|---|---|
| US-001 | En tant que visiteur, je souhaite découvrir la plateforme sans compte afin de juger la qualité des pros avant de m'inscrire. |
| US-002 | En tant que visiteur, je souhaite m'inscrire par téléphone + OTP SMS afin de créer mon compte en toute sécurité. |
| US-003 | En tant que client, je souhaite me connecter par OTP (et rester connecté) afin d'accéder à mon compte rapidement. |
| US-004 | En tant que client, je souhaite choisir ma langue (français/anglais) afin de naviguer dans ma langue. |
| US-005 | En tant que client, je souhaite accepter/refuser les consentements (CGU, vie privée, marketing) afin de contrôler mes données. |
| US-006 | En tant que client, je souhaite réinitialiser mon mot de passe par OTP afin de récupérer l'accès à mon compte. |
| US-007 | En tant que client, je souhaite me déconnecter et révoquer mes sessions afin de protéger mon compte. |
| US-008 | En tant que client, je souhaite que mon compte soit verrouillé après échecs répétés afin de me protéger contre les intrusions. |

## Épic B — Profil client (P0)

| ID | Story |
|---|---|
| US-011 | En tant que client, je souhaite compléter mon profil (nom, avatar) afin d'être identifiable par les pros. |
| US-012 | En tant que client, je souhaite enregistrer mes adresses favorites afin de publier un besoin en 2 gestes. |
| US-013 | En tant que client, je souhaite gérer mes favoris de professionnels afin de les retrouver vite. |
| US-014 | En tant que client, je souhaite configurer mes notifications par canal afin de ne pas être dérangé inutilement. |
| US-015 | En tant que client, je souhaite demander l'export ou la suppression de mes données (RGPD) afin d'exercer mes droits. |

## Épic C — Recherche & découverte (P0)

| ID | Story |
|---|---|
| US-016 | En tant que client, je souhaite rechercher par mot-clé, catégorie et ville afin de trouver un service. |
| US-017 | En tant que client, je souhaite rechercher par proximité (rayon autour de ma position GPS) afin de trouver des pros près de chez moi. |
| US-018 | En tant que client, je souhaite filtrer par note, prix et disponibilité (aujourd'hui/maintenant) afin d'affiner mes résultats. |
| US-019 | En tant que client, je souhaite trier par note, distance ou nombre de missions afin de comparer les pros. |
| US-020 | En tant que client, je souhaite voir les résultats sur une carte interactive afin de visualiser les distances. |
| US-021 | En tant que client, je souhaite voir les catégories populaires depuis l'accueil afin de démarrer vite. |
| US-022 | En tant que client, je souhaite voir les pros vérifiés, populaires et les promotions en page d'accueil afin de faire un choix éclairé. |

## Épic D — Besoins, devis et choix (P0 — cœur marketplace)

| ID | Story |
|---|---|
| **US-023** | **En tant que client, je souhaite publier un besoin (description, photos, budget, date, adresse) afin de recevoir plusieurs devis.** |
| US-024 | En tant que client, je souhaite définir l'urgence de mon besoin afin que les pros adaptent leur réponse. |
| US-025 | En tant que client, je souhaite recevoir les devis des pros notifiés afin de les comparer. |
| US-026 | En tant que client, je souhaite faire une contre-offre de prix afin de négocier. |
| US-027 | En tant que client, je souhaite sélectionner un devis afin de réserver le pro. |
| US-028 | En tant que client, je souhaite annuler ou réouvrir ma demande (avant paiement) afin de corriger mon choix. |
| US-029 | En tant que client, je souhaite suivre l'état de ma demande (OPEN → … → REVIEWED) afin de savoir où j'en suis. |

## Épic E — Réservation, paiement, prestation (P0/P2)

| ID | Story |
|---|---|
| US-031 | En tant que client, je souhaite choisir un créneau de rendez-vous parmi les disponibilités du pro afin d'éviter les chevauchements. |
| US-032 | En tant que client, je souhaite payer par MTN MoMo, Moov Money ou espèces afin de régler comme je préfère. (P2 pour le paiement en ligne) |
| US-033 | En tant que client, je souhaite recevoir un rappel automatique avant mon rendez-vous afin de ne pas l'oublier. |
| US-034 | En tant que client, je souhaite confirmer la prestation terminée afin de libérer le paiement. |
| US-035 | En tant que client, je souhaite ouvrir un litige sur une prestation payée afin de protéger mes droits. |

## Épic F — Avis (P0)

| ID | Story |
|---|---|
| US-041 | En tant que client, je souhaite noter le pro (note générale + ponctualité + qualité + rapport qualité/prix + politesse) afin de partager mon expérience. |
| US-042 | En tant que client, je souhaite ajouter des photos à mon avis afin de crédibiliser ma note. |
| US-043 | En tant que client, je ne peux laisser un avis qu'après une prestation complétée afin de garantir l'authenticité. |
| US-044 | En tant que client, je souhaite signaler un avis abusif afin de protéger la communauté. |

## Épic G — Messagerie & notifications (P0)

| ID | Story |
|---|---|
| US-046 | En tant que client, je souhaite discuter avec un pro (texte, photos, position) afin de préciser le besoin. |
| US-047 | En tant que client, je souhaite être notifié (push/SMS) à chaque événement important (devis reçu, message, paiement) afin de réagir vite. |
| US-048 | En tant que client, je souhaite lire mes notifications dans une boîte dédiée afin de ne rien manquer. |

## Épic H — Professionnel (P0)

| ID | Story |
|---|---|
| US-051 | En tant que professionnel, je souhaite m'inscrire avec mon rôle pro afin de créer ma vitrine. |
| US-052 | En tant que professionnel, je souhaite soumettre mon dossier de vérification (CIN, selfie, documents) afin d'obtenir le badge vérifié. |
| US-053 | En tant que professionnel, je souhaite créer mon profil (bio, expérience, prix, horaires) afin d'être visible et crédible. |
| US-054 | En tant que professionnel, je souhaite publier mes services et mon portfolio (photos, avant/après) afin de montrer mon travail. |
| US-055 | En tant que professionnel, je souhaite définir mes disponibilités (créneaux, congés) afin de ne jamais être surbooké. |
| US-056 | En tant que professionnel, je souhaite recevoir les demandes correspondant à mes services afin de répondre. |
| US-057 | En tant que professionnel, je souhaite envoyer un devis (prix, délai, message) afin de remporter la mission. |
| US-058 | En tant que professionnel, je souhaite négocier par contre-offre afin de trouver un accord. |
| US-059 | En tant que professionnel, je souhaite gérer mon calendrier de rendez-vous afin d'organiser mes journées. |
| US-060 | En tant que professionnel, je souhaite confirmer la prestation afin de recevoir mon paiement. |
| US-061 | En tant que professionnel, je souhaite consulter mes statistiques (missions, taux d'acceptation, annulations) et mon Trust Score afin d'améliorer ma réputation. |
| US-062 | En tant que professionnel, je souhaite voir mes revenus et demander un retrait afin de gérer mon activité. |

## Épic I — Livreur (P2)

| ID | Story |
|---|---|
| US-071 | En tant que livreur, je souhaite m'inscrire et me valider (CIN, véhicule) afin de recevoir des courses. |
| US-072 | En tant que livreur, je souhaite passer en ligne/disponible afin de recevoir des missions. |
| US-073 | En tant que livreur, je souhaite accepter une course et naviguer vers l'établissement afin de la réaliser. |
| US-074 | En tant que livreur, je souhaite livrer et prouver la livraison (photo) afin de clôturer la course. |
| US-075 | En tant que livreur, je souhaite consulter mes gains et mon historique afin de suivre mon activité. |

## Épic J — Restaurants (P2)

| ID | Story |
|---|---|
| US-076 | En tant que restaurateur, je souhaite créer ma fiche (menus, photos, horaires, zone de livraison) afin de vendre en ligne. |
| US-077 | En tant que client, je souhaite commander depuis un restaurant proche afin de me faire livrer. |
| US-078 | En tant que client, je souhaite suivre ma commande en temps réel afin de savoir quand elle arrive. |

## Épic K — Administration (P0/P2)

| ID | Story |
|---|---|
| US-081 | En tant qu'admin, je souhaite valider les dossiers de vérification afin d'accorder les badges. |
| US-082 | En tant qu'admin, je souhaite modérer les avis et contenus signalés afin de garder la plateforme saine. |
| US-083 | En tant qu'admin, je souhaite arbitrer les litiges afin de protéger les deux parties. |
| US-084 | En tant qu'admin, je souhaite consulter les statistiques nationales et par pays afin de piloter la plateforme. |
| US-085 | En tant qu'admin, je souhaite suspendre ou bannir un compte afin de protéger la communauté. |

## Épic L — Confiance (P0, transversal)

| ID | Story |
|---|---|
| US-091 | En tant que client, je souhaite toujours voir si un pro est vérifié, son Trust Score et ses stats afin de choisir en confiance. |
| US-092 | En tant que professionnel, je souhaite voir mon Trust Score et les facteurs qui le composent afin de l'améliorer. |

---

## Statistiques du backlog

- Total MVP (P0) : **34 US** — total documents : 63 US
- Chaque US sera découpée en critères d'acceptation (Given/When/Then) lors du wireframing.
