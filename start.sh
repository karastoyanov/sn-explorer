#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
VENV="$ROOT/backend/.venv"

# ── Backend ──────────────────────────────────────────────────────
echo "==> Setting up Python venv…"
# Prefer python3.13 if available (Flask deps are built against it on this machine)
PY=$(command -v python3.13 || command -v python3 || echo "python3")
"$PY" -m venv "$VENV" --upgrade-deps -q

echo "==> Installing backend dependencies…"
"$VENV/bin/pip" install -r "$ROOT/backend/requirements.txt" -q

echo "==> Starting Flask backend on http://localhost:5000"
cd "$ROOT/backend"
"$VENV/bin/python" app.py &
BACKEND_PID=$!

# ── Frontend ─────────────────────────────────────────────────────
echo "==> Installing frontend dependencies…"
cd "$ROOT/frontend"
npm install --silent

echo "==> Starting Vite dev server on http://localhost:3000"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "  Backend  → http://localhost:5000"
echo "  Frontend → http://localhost:3000  (opens in a moment)"
echo ""
echo "Press Ctrl+C to stop both servers."

cleanup() {
  echo ""
  echo "Stopping servers…"
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
}
trap cleanup SIGINT SIGTERM
wait
