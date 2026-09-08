# Modèle opérationnel et monétisation — pilote TCHATCHA

Version : 1.0 — décisions produit postérieures à FCT-016B2
Statut : cadrage produit, sans modification du code applicatif.

## 1. Décisions de modèle

TCHATCHA retient un modèle hybride de mise en relation.

### Parcours autonome

Le client recherche lui-même des artisans proches, avec des filtres par métier,
zone ou distance, disponibilité, vérification, note et Trust Score. Il consulte
les profils puis adresse sa demande et ses demandes de devis à l’artisan choisi.

### Parcours assisté

Le client confie sa demande à TCHATCHA. L’équipe reçoit et qualifie le besoin,
présélectionne deux ou trois artisans proches et adaptés et, pour une urgence ou
un service standardisé, peut affecter la demande à un seul artisan. Le client
compare les devis et conserve le choix final.

Dans les deux parcours, devis, réservation, paiement, protection, litige et avis
restent dans TCHATCHA. L’assistance ne retire pas au client sa décision finale,
sauf affectation opérationnelle explicitement acceptée par le client.

## 2. Politique anti-contournement

Avant l’étape autorisée, les coordonnées personnelles sont masquées et la
messagerie interne est proposée. La détection des numéros, liens WhatsApp et
intentions de paiement externe est graduelle et proportionnée.

Une simple détection ne déclenche aucune sanction automatique. La séquence est :
avertissement, analyse humaine ou contextualisée, suspension progressive si les
faits sont établis, puis possibilité de recours. Les règles respectent la
protection des données et excluent la lecture excessive ou indifférenciée des
messages.

L’escrow, l’assistance, le remboursement, la garantie et les litiges sont réservés
aux transactions internes. Les avis vérifiés et la progression du Trust Score ne
concernent que les missions internes. Un partage externe renvoie vers une page
TCHATCHA et non vers des coordonnées directes.

## 3. Hypothèse de commission du pilote

Les taux suivants sont des hypothèses initiales configurables à valider sur le
terrain, et non une tarification commerciale définitive :

- 10 % sur la première prestation entre un client et un professionnel ;
- 6 % sur les prestations suivantes entre les mêmes utilisateurs ;
- aucun frais de plateforme facturé au client pendant le pilote ;
- frais du prestataire de paiement suivis séparément ;
- taux administrables par catégorie, montant, campagne et type de relation.

Aucune valeur ne doit être codée définitivement dans l’application. Les
indicateurs à mesurer sont la conversion, le contournement, la marge nette, le
coût de paiement, le réachat et la satisfaction.

## 4. Architecture financière

Le client paie depuis TCHATCHA. Les fonds sont reçus et conservés par un
prestataire financier agréé ; après validation, l’artisan reçoit sa part et
TCHATCHA reçoit sa commission. Le versement est gelé en cas de litige.

Aucun encaissement ne doit arriver sur le compte ou le numéro Mobile Money
personnel du fondateur. Le prestataire final reste soumis à validation juridique
et réglementaire au Bénin et dans l’espace UEMOA. Tant qu’aucun partenaire réel
n’est validé, le paiement reste simulé.

## 5. Journal TCHATCHA — cadrage hors chemin critique

Le Journal TCHATCHA est un cadrage produit de haut niveau, non nécessaire au
chemin critique immédiat du pilote. Il pourra proposer un fil local de
publications professionnelles, des artisans, fournisseurs et commerces
sponsorisés, des promotions et campagnes géolocalisées, ainsi que des
réalisations, conseils et contenus ordinaires.

Les interactions envisagées sont les likes, commentaires, réponses,
enregistrements, partages, partage externe par lien profond vers TCHATCHA et
demande de devis depuis une publication. La publication initiale serait réservée
aux professionnels vérifiés, fournisseurs agréés et administrateurs. La mention
« Sponsorisé » est obligatoire pour tout contenu concerné.

Le Journal devra intégrer modération, signalement et anti-spam. Les coordonnées
et paiements externes sont interdits dans les contenus sponsorisés. Les
statistiques envisagées couvrent vues, clics, interactions et demandes générées.

La monétisation envisagée comprend forfait par durée, ciblage géographique ou
métier, priorité d’affichage et campagnes négociées. Les tarifs sont provisoires
et administrables. Aucun like ou commentaire n’est rémunéré au lancement ; les
points de fidélité sont une piste ultérieure.

## 6. Priorisation du pilote

Le parcours principal du MVP ne doit pas être interrompu. Les éléments
indispensables au pilote sont à terminer en premier, puis vient le parcours
mobile minimal. Le pilote est limité au couloir Cotonou–Abomey-Calavi.

Le Journal complet sera développé après validation du besoin terrain. Une version
très légère peut être testée pendant le pilote si elle ne dégrade ni la mise en
relation, ni le paiement simulé, ni le support.

## 7. Hypothèses et indicateurs à tester

Hypothèses : les clients acceptent l’assistance sans perdre leur choix final ;
deux ou trois devis suffisent à comparer ; le masquage des coordonnées réduit
le contournement sans dégrader la conversion ; les taux 10 % / 6 % sont
acceptables pour les professionnels ; le paiement simulé permet de tester le
parcours ; un Journal léger augmente les demandes sans détourner l’offre.

Indicateurs : conversion recherche→demande, demande→devis, devis→réservation,
taux de contournement détecté et confirmé, recours, marge nette, coût de
paiement, réachat, satisfaction, délai de qualification et part autonome/assistée.

## 8. Risques et décisions ouvertes

Risques principaux : dépendance à l’assistance humaine, faux positifs
anti-contournement, non-acceptation des commissions, indisponibilité d’un
prestataire agréé, exigences réglementaires Bénin/UEMOA, baisse de conversion
due au masquage, dérive du Journal vers un réseau social hors priorité.

Décisions encore ouvertes : prestataire financier et calendrier de validation,
taux finaux après pilote, seuils et procédure de recours anti-contournement,
niveau d’assistance par catégorie, contenu exact du Journal léger et critères de
passage au Journal complet.

## 9. Contradictions et résolution

| Contradiction | Résolution retenue |
|---|---|
| Les règles existantes présentent des impacts chiffrés du Trust Score alors que FCT-016B2 ne dispose pas d’une formule métier validée. | Les impacts chiffrés restent une cible documentaire ; aucun recalcul ni nouvelle formule n’est introduit avant un lot distinct validant formule, pondérations, versionnement et recalcul. |
| BR-094 cite 10 % comme exemple alors que le pilote propose 10 % puis 6 %. | 10 % / 6 % sont des hypothèses configurables du pilote, jamais une tarification commerciale définitive ; la configuration et la mesure terrain priment. |
| Le paiement et la commission sont décrits comme opérationnels alors qu’aucun partenaire réel n’est validé. | Le paiement reste simulé au pilote ; tout encaissement réel dépend d’un prestataire agréé validé juridiquement et réglementairement. |
| Le Journal apparaît dans les ambitions de publicité alors que le MVP doit rester prioritaire. | Journal complet après validation terrain ; version légère seulement si elle reste hors chemin critique. |
| Un parcours assisté pourrait être interprété comme une affectation imposée. | Le client conserve le choix final ; l’affectation unique ne vaut que pour urgence ou service standardisé et avec acceptation explicite. |

## 10. Traçabilité et futurs lots

Ce document complète `05-roadmap-technique.md`, `08-specification-fonctionnelle.md`,
`19-business-rules.md` et `21-plan-pilote.md`. Il s’appuie notamment sur les
principes de recherche, devis, paiement, réputation, audit et protection des
données déjà présents dans les documents 06, 10, 12, 15, 19 et 21.

Les futurs lots à créer, sans leur attribuer un numéro FCT non validé, sont :

1. validation de la formule, des pondérations, du versionnement et du recalcul
   du Trust Score ;
2. validation juridique/réglementaire et branchement d’un prestataire financier ;
3. configuration et mesure du modèle de commission du pilote ;
4. spécification du Journal, de sa modération, de ses statistiques et de sa
   monétisation ;
5. parcours mobile minimal et, séparément, Journal complet.
