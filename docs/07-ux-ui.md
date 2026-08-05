# Étape 3 — Product Design / UX Architecture (TCHATCHA)

Version : 1.0 — document maître
Contexte : Étape 2 gelée et validée (bug.md). Priorité : concevoir l'expérience, pas dessiner des écrans.

---

## 1. Méthode

Étape 3 = **Product Design**. L'ordre est imposé :

```
3.1 Product Flows  →  3.2 Inventaire UX  →  3.3 Design System  →  3.4 Design Tokens
→  3.5 Identité de marque  →  3.6 UX Writing  →  3.7 Wireframes (après validation)
→  3.8 Maquettes (après validation, traçables aux User Stories)
```

Rien n'est dessiné avant que les fondations (marque, tokens, system, écriture) soient validées.

## 2. Livrables

| # | Livrable | Document | Statut |
|---|---|---|---|
| 3.1 | Product Flows (4 personas) | `07a-product-flows.md` | ✅ livré |
| 3.2 | Inventaire UX (écrans, dialogues, sheets, wizards, notifications, emails, SMS, états) | `07b-inventaire-ux.md` | ✅ livré |
| 3.3 | Design System (couleurs, typo, composants, états, accessibilité) | `07c-design-system.md` | ✅ livré |
| 3.4 | Design Tokens | `07d-design-tokens.md` | ✅ livré |
| 3.5 | Identité de marque TCHATCHA | `07e-identite-marque.md` | ✅ livré |
| 3.6 | UX Writing (microcopies) | `07f-ux-writing.md` | ✅ livré |
| – | Backlog User Stories (base de traçabilité) | `07g-user-stories.md` | ✅ livré |
| 3.7 | Wireframes (navigation + hiérarchie uniquement) | après validation 3.1–3.6 | ⏳ |
| 3.8 | Maquettes (traçables US → écran) | après validation 3.7 | ⏳ |

## 3. Traçabilité (exigence 3.8)

Chaque écran/wireframe/maquette porte un **identifiant d'écran** lié à une ou plusieurs User Stories.

```
Format : SCR-<numéro> — <nom de l'écran>
         ↔ US-XXX : <résumé de la story>

Exemple :
SCR-042 — Publication de besoin
   ↔ US-023 : En tant que client, je souhaite publier un besoin
              afin de recevoir plusieurs devis.
   ↔ US-024 : ... (ajouter photos et budget)
```

Cette chaîne est maintenue **jusqu'au code** :
`US → SCR → widget Flutter (mobile/features/<écran>) → tests (US = critère d'acceptation)`.

Le backlog de référence est `07g-user-stories.md` ; l'inventaire (`07b`) référence
déjà les SCR ↔ US.

## 4. Points de validation

- [ ] Product Flows approuvés (parcours complets des 4 personas)
- [ ] Inventaire UX complet (rien ne manque : états, emails, SMS)
- [ ] Identité de marque (palette, slogan, ton) validée
- [ ] Design Tokens approuvés (ils deviennent le code Flutter `core/theme`)
- [ ] Design System validé (composants + états + accessibilité)
- [ ] Microcopies validées (français d'abord ; anglais ensuite)
- [ ] Backlog US validé → alors seulement wireframes (3.7)
