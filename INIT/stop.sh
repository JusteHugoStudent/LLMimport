#!/usr/bin/env bash

ROOT="$(cd "$(dirname "$0")" && pwd)"
PIDFILE="$ROOT/.pids"

GREEN='\033[0;32m'
NC='\033[0m'

echo "Arrêt de NLP Eval Platform..."

# 1. Kill tracked PIDs from .pids file
if [ -f "$PIDFILE" ]; then
  while IFS=: read -r name pid; do
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      echo "  Arrêt de $name (PID $pid)..."
      kill "$pid" 2>/dev/null
      # Wait briefly then force-kill if still alive
      sleep 0.5
      kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null
    fi
  done < "$PIDFILE"
  rm -f "$PIDFILE"
fi

# 2. Kill any remaining processes on our ports (safety net)
for port in 8000 5173; do
  pids=$(lsof -ti :$port 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "  Nettoyage port $port..."
    echo "$pids" | xargs kill 2>/dev/null || true
  fi
done

# 3. Kill any stray uvicorn or vite processes from our project
pkill -f "uvicorn main:app.*8000" 2>/dev/null || true
pkill -f "node.*vite.*INIT/frontend" 2>/dev/null || true

echo -e "${GREEN}Tous les services sont arrêtés.${NC}"
