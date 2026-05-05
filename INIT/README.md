# Homere

Plateforme web pour l'évaluation de la correction d'analyses syntaxiques (projet de recherche TAL/NLP).
Compare des approches classiques (ULISSE, SVM, PUPA) et LLM-as-a-judge pour détecter les erreurs dans les annotations syntaxiques au format CoNLL-U.

## Stack 

Cette version reste volontairement locale et légère :

- **Backend** : FastAPI, SQLite, Stanza, conllu, scikit-learn, Ollama via HTTP.
- **Frontend** : React, Vite, Tailwind CSS, Recharts, React Flow.
- **Stockage** : `data/` pour les corpus et la base locale, `results/` pour les exports exploitables.

## Prérequis

- **Python 3.10 à 3.12** (3.13+ non supporté par certaines dépendances)
- **Node.js 18+**
- **Ollama** (optionnel, pour le détecteur LLM-as-a-judge)

## Installation rapide

```bash
# Depuis la racine du projet :
./setup.sh
```

Le script détecte automatiquement la bonne version de Python, crée le virtualenv, installe toutes les dépendances backend et frontend.

## Lancement 

```bash
./start.sh
```

Lance automatiquement Ollama + Backend + Frontend. Ctrl+C pour tout arrêter.

## Installation manuelle

### Backend

```bash
cd backend

# Créer le virtualenv (utiliser python3.12, 3.11 ou 3.10)
python3 -m venv venv
source venv/bin/activate

pip install --upgrade pip
pip install -r requirements.txt

# Télécharger le modèle Stanza français (première fois uniquement)
python -c "import stanza; stanza.download('fr')"

# Lancer le serveur
python main.py
# → http://localhost:8000
```

### Frontend

```bash
cd frontend
npm install --ignore-scripts
npm run dev
# → http://localhost:5173
```

### Ollama (optionnel)

```bash
# Installer Ollama : https://ollama.ai
ollama pull llama3
ollama serve
# → http://localhost:11434
```

## Utilisation

1. **Corpus** : Importer un fichier `.conllu` (Universal Dependencies)
2. **Expériences** : Configurer l'injection d'erreurs + choisir les détecteurs
3. **Résultats** : Visualiser et comparer les résultats (P/R/F1, ROC, matrices de confusion)

Chaque expérience terminée produit aussi un dossier dans `results/` avec :

- `results.json` : résultats complets et vérité terrain
- `metrics.csv` : métriques globales par détecteur
- `details.csv` : détail phrase par phrase, pratique pour analyse et rapport

## Structure

```
backend/     → API FastAPI (Python)
frontend/    → Interface React + Tailwind + Recharts + React Flow
data/        → Base SQLite locale + fichiers .conllu importés
results/     → Exports JSON/CSV des expériences
```

## Commandes utiles

```bash
./setup.sh       # installe backend + frontend
./start.sh       # lance Ollama si disponible, le backend et le frontend
./stop.sh        # arrête les services

cd frontend && npm run build
cd backend && source venv/bin/activate && python -m compileall .
```
