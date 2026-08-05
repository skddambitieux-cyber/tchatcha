# TCHATCHA — Template de Pull Request
# Référence : 14-cicd.md, 18-developer-handbook.md

## Description

Résumé des changements (quoi et pourquoi, 2-3 phrases max).

## Type de changement

- [ ] ✨ Feature (nouvelle fonctionnalité)
- [ ] 🐛 Fix (correction de bug)
- [ ] ♻️ Refactor (aucun changement de comportement)
- [ ] 📝 Docs
- [ ] 🔧 Configuration / CI

## Traçabilité

| Élément | Référence |
|---|---|
| US / FCT | `US-0X` / `FCT-0X` (docs/07g, 08) |
| Règle métier | `BR-0XX` (docs/19) si applicable |
| Écran (maquette) | `SCR-0XX` (docs/maquettes) si applicable |

## Tests

- [ ] Lint OK (`npx nx run-many -t lint`)
- [ ] Tests unitaires OK
- [ ] Tests e2e OK (backend)
- [ ] Testé manuellement sur : Android / iOS / Web

## Checklist

- [ ] Pas de secret dans le code ou les commits
- [ ] Migration de base de données versionnée (si schéma modifié)
- [ ] Documentation mise à jour si besoin (docs/)
- [ ] Conventional Commit respecté (scope : module)

## Captures / écrans

(optionnel — lien vers maquettes ou captures)