# Corpus sources pour Homere

Objectif : conserver ici les corpus Universal Dependencies originaux avant import dans Homere.

## Organisation

- `data/source_corpora/fr/` : corpus francais UD en `.conllu`
- `data/source_corpora/en/` : corpus anglais UD en `.conllu`

## Selection recommandee

### Francais

1. UD_French-GSD
   - Priorite : corpus principal francais.
   - A prendre d'abord : `fr_gsd-ud-test.conllu`, puis `fr_gsd-ud-dev.conllu`.
   - A prendre ensuite si besoin de volume : `fr_gsd-ud-train.conllu`.

2. UD_French-Sequoia
   - Priorite : second corpus francais, plus varie en genres.
   - A prendre d'abord : `fr_sequoia-ud-test.conllu`, puis `fr_sequoia-ud-dev.conllu`.
   - A prendre ensuite si besoin : `fr_sequoia-ud-train.conllu`.

### Anglais

1. UD_English-EWT
   - Priorite : corpus principal anglais.
   - A prendre d'abord : `en_ewt-ud-test.conllu`, puis `en_ewt-ud-dev.conllu`.
   - A prendre ensuite si besoin de volume : `en_ewt-ud-train.conllu`.

2. UD_English-GUM
   - Priorite : corpus anglais multi-genres pour tester la robustesse.
   - A prendre d'abord : `en_gum-ud-test.conllu`, puis `en_gum-ud-dev.conllu`.
   - A prendre ensuite si besoin : `en_gum-ud-train.conllu`.

## Protocole conseille

1. Smoke test : fichiers `test` uniquement.
2. Comparaison normale : `test + dev`.
3. Experience plus lourde : ajouter `train`, mais limiter le nombre de phrases dans Homere.
