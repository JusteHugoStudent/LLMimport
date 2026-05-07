#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
PIDFILE="$ROOT/.pids"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

# -------------------------------------------------
# Stop any previous run first
# -------------------------------------------------
if [ -f "$PIDFILE" ]; then
  echo "  Nettoyage d'une session précédente..."
  bash "$ROOT/stop.sh" 2>/dev/null || true
fi

echo "========================================"
echo "  NLP Eval Platform — Démarrage"
echo "========================================"

# Kill anything already on our ports
for port in 8000 5173; do
  pid=$(lsof -ti :$port 2>/dev/null || true)
  if [ -n "$pid" ]; then
    echo -e "${YELLOW}[WARN]${NC} Port $port occupé (PID $pid), arrêt..."
    kill $pid 2>/dev/null || true
    sleep 1
  fi
done

# Init PID file
> "$PIDFILE"

# -------------------------------------------------
# 1. Ollama
# -------------------------------------------------
OLLAMA_STARTED_BY_US=false
if command -v ollama &>/dev/null; then
  if curl -s http://localhost:11434/api/tags &>/dev/null; then
    echo -e "${GREEN}[OK]${NC} Ollama déjà en cours d'exécution."
  else
    echo "  Démarrage d'Ollama..."
    if [ -d "/Applications/Ollama.app" ]; then
      open -a Ollama
    else
      ollama serve &>/dev/null &
      echo "ollama:$!" >> "$PIDFILE"
    fi
    OLLAMA_STARTED_BY_US=true
    for i in $(seq 1 20); do
      if curl -s http://localhost:11434/api/tags &>/dev/null; then
        echo -e "${GREEN}[OK]${NC} Ollama démarré."
        break
      fi
      sleep 0.5
    done
    if ! curl -s http://localhost:11434/api/tags &>/dev/null; then
      echo -e "${YELLOW}[WARN]${NC} Ollama n'a pas répondu. Le LLM-as-a-judge ne sera pas disponible."
    fi
  fi
else
  echo -e "${YELLOW}[WARN]${NC} Ollama non installé. Le détecteur LLM-as-a-judge ne sera pas disponible."
fi

# -------------------------------------------------
# 2. Backend
# -------------------------------------------------
echo ""
echo "  Démarrage du backend..."

if [ ! -d "$ROOT/backend/venv" ]; then
  echo -e "${RED}[ERREUR]${NC} Le venv backend n'existe pas. Lancez d'abord : ./setup.sh"
  exit 1
fi

cd "$ROOT/backend"
source venv/bin/activate
python main.py &
BACKEND_PID=$!
echo "backend:$BACKEND_PID" >> "$PIDFILE"

for i in $(seq 1 20); do
  if curl -s http://localhost:8000/api/health &>/dev/null; then
    echo -e "${GREEN}[OK]${NC} Backend démarré sur http://localhost:8000 (PID $BACKEND_PID)"
    break
  fi
  sleep 0.5
done

if ! curl -s http://localhost:8000/api/health &>/dev/null; then
  echo -e "${RED}[ERREUR]${NC} Le backend n'a pas démarré."
  exit 1
fi

# -------------------------------------------------
# 3. Frontend
# -------------------------------------------------
echo ""
echo "  Démarrage du frontend..."

if [ ! -d "$ROOT/frontend/node_modules" ]; then
  echo -e "${RED}[ERREUR]${NC} node_modules manquant. Lancez d'abord : ./setup.sh"
  exit 1
fi

cd "$ROOT/frontend"
npm run dev &
FRONTEND_PID=$!
echo "frontend:$FRONTEND_PID" >> "$PIDFILE"
sleep 2
echo -e "${GREEN}[OK]${NC} Frontend démarré sur http://localhost:5173 (PID $FRONTEND_PID)"

# -------------------------------------------------
# Cleanup on Ctrl+C or terminal close
# -------------------------------------------------
cleanup() {
  echo ""
  echo "Arrêt de tous les services..."
  bash "$ROOT/stop.sh" 2>/dev/null || true
  echo "Terminé."
  exit 0
}
trap cleanup EXIT INT TERM

# -------------------------------------------------
# Ready
# -------------------------------------------------
echo ""
echo "========================================"
echo "  Tous les services sont lancés !"
echo "  Interface : http://localhost:5173"
echo "  API       : http://localhost:8000"
echo "  Ollama    : http://localhost:11434"
echo "========================================"
echo ""
echo "Appuyez sur Ctrl+C pour tout arrêter."
echo "(Ou lancez ./stop.sh depuis un autre terminal)"

wait
