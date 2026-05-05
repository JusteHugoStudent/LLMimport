#!/usr/bin/env bash
set -e

echo "========================================"
echo "  NLP Eval Platform — Installation"
echo "========================================"

# -------------------------------------------------
# 1. Find a compatible Python (3.10–3.12)
# -------------------------------------------------
PYTHON=""
for candidate in python3.12 python3.11 python3.10 python3; do
  if command -v "$candidate" &>/dev/null; then
    version=$("$candidate" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>/dev/null || true)
    major=$(echo "$version" | cut -d. -f1)
    minor=$(echo "$version" | cut -d. -f2)
    if [ "$major" = "3" ] && [ "$minor" -ge 10 ] && [ "$minor" -le 12 ]; then
      PYTHON="$candidate"
      echo "[OK] Python trouvé : $PYTHON ($version)"
      break
    fi
  fi
done

if [ -z "$PYTHON" ]; then
  echo "[ERREUR] Python 3.10, 3.11 ou 3.12 requis."
  echo "  Installez-le avec : brew install python@3.12"
  exit 1
fi

# -------------------------------------------------
# 2. Backend — virtualenv + dépendances
# -------------------------------------------------
echo ""
echo "--- Backend ---"

cd "$(dirname "$0")/backend"

if [ -d "venv" ]; then
  echo "  Suppression de l'ancien venv..."
  rm -rf venv
fi

echo "  Création du virtualenv..."
"$PYTHON" -m venv venv

echo "  Activation du venv..."
# Windows (Git Bash) uses Scripts/, Linux/macOS uses bin/
if [ -f "venv/Scripts/activate" ]; then
  source venv/Scripts/activate
else
  source venv/bin/activate
fi

echo "  Mise à jour de pip..."
python -m pip install --upgrade pip --quiet

echo "  Installation des dépendances Python..."
pip install -r requirements.txt --quiet

echo "[OK] Backend prêt."

deactivate
cd ..

# -------------------------------------------------
# 3. Frontend — npm install
# -------------------------------------------------
echo ""
echo "--- Frontend ---"

cd frontend

if [ -d "node_modules" ]; then
  echo "  Suppression de l'ancien node_modules..."
  rm -rf node_modules
fi

echo "  Installation des dépendances npm..."
npm install --ignore-scripts --loglevel=error

echo "[OK] Frontend prêt."

cd ..

# -------------------------------------------------
# 4. Local runtime directories
# -------------------------------------------------
mkdir -p data/corpora results

# -------------------------------------------------
# Done
# -------------------------------------------------
echo ""
echo "========================================"
echo "  Installation terminée !"
echo "========================================"
echo ""
echo "Pour lancer le projet :"
echo ""
echo "  Terminal 1 (backend) :"
echo "    cd backend && source venv/Scripts/activate && python main.py"
echo ""
echo "  Terminal 2 (frontend) :"
echo "    cd frontend && npm run dev"
echo ""
echo "  Ollama (optionnel) :"
echo "    ollama serve"
echo ""
