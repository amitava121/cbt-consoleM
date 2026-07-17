#!/usr/bin/env bash
set -euo pipefail

# ============================================================
#  CBE Console — Full Stack Dev Launcher
#  Starts: PostgreSQL (Docker) → Backend → Admin Panel
# ============================================================

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT_DIR/back-end"
FRONTEND_DIR="$ROOT_DIR/admin-panel"
PIDS=()

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[CBE]${NC} $1"; }
warn() { echo -e "${YELLOW}[CBE]${NC} $1"; }
err()  { echo -e "${RED}[CBE]${NC} $1"; }

# --- Cleanup on exit ---
cleanup() {
  echo ""
  warn "Shutting down all processes..."
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  wait 2>/dev/null || true
  log "All processes stopped. Bye!"
}
trap cleanup EXIT INT TERM

# --- 1. Kill any processes on reserved ports (3000, 5173) ---
kill_port() {
  local port=$1
  local pids
  pids=$(lsof -ti :"$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    warn "Port :$port is in use. Killing PID(s): $pids"
    echo "$pids" | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
}
log "Cleaning reserved ports..."
kill_port 3000
kill_port 5173

# --- 2. Check Docker / OrbStack ---
log "Checking Docker (OrbStack)..."
if ! docker info >/dev/null 2>&1; then
  warn "Docker not running. Launching OrbStack..."
  open -a OrbStack 2>/dev/null || true
  log "Waiting for Docker to be ready..."
  for i in $(seq 1 30); do
    if docker info >/dev/null 2>&1; then
      log "Docker is ready!"
      break
    fi
    sleep 2
  done
  if ! docker info >/dev/null 2>&1; then
    err "Docker/OrbStack failed to start. Please start it manually."
    exit 1
  fi
fi

# --- 3. Start PostgreSQL container ---
log "Checking PostgreSQL container..."
if docker ps --format '{{.Names}}' | grep -q 'cbe-console-postgres'; then
  log "PostgreSQL container already running."
else
  if docker ps -a --format '{{.Names}}' | grep -q 'cbe-console-postgres'; then
    warn "PostgreSQL container exists but stopped. Starting..."
    docker start cbe-console-postgres
  else
    err "PostgreSQL container 'cbe-console-postgres' not found."
    err "Create it with:"
    err "  docker run -d --name cbe-console-postgres \\"
    err "    -e POSTGRES_PASSWORD=postgres \\"
    err "    -e POSTGRES_DB=cbe-cm \\"
    err "    -p 5432:5432 postgres:17"
    exit 1
  fi
  log "Waiting for PostgreSQL to accept connections..."
  for i in $(seq 1 15); do
    if docker exec cbe-console-postgres pg_isready -U postgres >/dev/null 2>&1; then
      log "PostgreSQL is ready!"
      break
    fi
    sleep 1
  done
fi

# --- 4. Install deps if needed ---
if [ ! -d "$BACKEND_DIR/node_modules" ]; then
  log "Installing backend dependencies..."
  (cd "$BACKEND_DIR" && npm install)
fi
if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  log "Installing frontend dependencies..."
  (cd "$FRONTEND_DIR" && npm install)
fi

# --- 5. Run database migrations ---
log "Running database migrations..."
(cd "$BACKEND_DIR" && npx drizzle-kit migrate) || warn "Migration skipped or failed (may already be up to date)."

# --- 6. Start backend ---
log "Starting backend (Fastify) on :3000..."
(cd "$BACKEND_DIR" && npm run dev) &
BACKEND_PID=$!
PIDS+=("$BACKEND_PID")

# Wait for backend to be ready
log "Waiting for backend to start..."
for i in $(seq 1 20); do
  if curl -s http://localhost:3000/health >/dev/null 2>&1; then
    log "Backend is ready! http://localhost:3000"
    break
  fi
  sleep 1
done

# --- 7. Start frontend ---
log "Starting admin panel (Vite) on :5173..."
(cd "$FRONTEND_DIR" && npm run dev) &
FRONTEND_PID=$!
PIDS+=("$FRONTEND_PID")

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  CBE Console is running!${NC}"
echo -e "${CYAN}  Backend:    http://localhost:3000${NC}"
echo -e "${CYAN}  API Docs:   http://localhost:3000/docs${NC}"
echo -e "${CYAN}  Frontend:   http://localhost:5173${NC}"
echo -e "${CYAN}  PostgreSQL: localhost:5432 (cbe-cm)${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo ""
log "Press Ctrl+C to stop all services."

# --- 8. Wait for either process to exit ---
wait
