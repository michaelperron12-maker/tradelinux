#!/bin/bash
# ============================================
# QuadScalp — Trading Platform Launcher
# Double-cliquer ce fichier pour tout démarrer
# ============================================

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

clear
echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║       QuadScalp Trading Platform         ║"
echo "  ║       ES / NQ / CL — CME Futures         ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""

# Kill any previous instances
fuser -k 8000/tcp 2>/dev/null
fuser -k 5173/tcp 2>/dev/null

# 1. Start Backend (FastAPI)
echo "  [1/3] Démarrage du backend API..."
cd "$DIR/backend"
"$DIR/venv/bin/uvicorn" app.main:app --host 0.0.0.0 --port 8000 > /dev/null 2>&1 &
BACKEND_PID=$!
sleep 2

# Check backend is running
if curl -s http://localhost:8000/api/health > /dev/null 2>&1; then
    echo "  ✓ Backend OK (port 8000)"
else
    echo "  ✗ Backend failed to start!"
    exit 1
fi

# 2. Start Frontend (Vite dev server)
echo "  [2/3] Démarrage du frontend..."
cd "$DIR/frontend"
npx vite --port 5173 > /dev/null 2>&1 &
FRONTEND_PID=$!
sleep 3
echo "  ✓ Frontend OK (port 5173)"

# 3. Open browser
echo "  [3/3] Ouverture du navigateur..."
echo ""
xdg-open "http://localhost:5173" 2>/dev/null || \
  firefox "http://localhost:5173" 2>/dev/null || \
  google-chrome "http://localhost:5173" 2>/dev/null || \
  echo "  Ouvrir manuellement: http://localhost:5173"

echo ""
echo "  ┌──────────────────────────────────────────────┐"
echo "  │  Platform:  http://localhost:5173             │"
echo "  │  API:       http://localhost:8000/api/health  │"
echo "  │  Mode:      DEMO (marché simulé)              │"
echo "  │                                               │"
echo "  │  Appuyez Ctrl+C pour arrêter                  │"
echo "  └──────────────────────────────────────────────┘"
echo ""

# Keep running until Ctrl+C
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo ''; echo '  Platform arrêtée.'; exit 0" INT TERM
wait $BACKEND_PID $FRONTEND_PID
