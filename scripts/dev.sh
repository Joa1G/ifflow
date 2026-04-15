#!/usr/bin/env bash
# ============================================================
# IFFLOW — dev.sh
# ============================================================
# Sobe backend e frontend em paralelo, com logs prefixados
# por serviço e cores diferentes. Ctrl+C encerra ambos.
#
# Requisitos:
#   - Postgres já subido (este script sobe se não estiver)
#   - Dependências instaladas (rode ./scripts/setup.sh primeiro)
#
# Uso:
#   ./scripts/dev.sh
#   ./scripts/dev.sh --backend-only
#   ./scripts/dev.sh --frontend-only
# ============================================================

set -euo pipefail

# ------------------------------------------------------------
# Cores
# ------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${BLUE}ℹ${NC}  $*"; }
success() { echo -e "${GREEN}✓${NC}  $*"; }
warn()    { echo -e "${YELLOW}⚠${NC}  $*"; }
error()   { echo -e "${RED}✗${NC}  $*" >&2; }

# ------------------------------------------------------------
# Raiz do monorepo
# ------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# ------------------------------------------------------------
# Parse de flags
# ------------------------------------------------------------
RUN_BACKEND=true
RUN_FRONTEND=true
for arg in "$@"; do
  case $arg in
    --backend-only)  RUN_FRONTEND=false ;;
    --frontend-only) RUN_BACKEND=false ;;
    --help|-h)
      sed -n '2,17p' "$0"
      exit 0
      ;;
    *)
      error "Argumento desconhecido: $arg"
      exit 1
      ;;
  esac
done

# ------------------------------------------------------------
# Garantir que Postgres está rodando
# ------------------------------------------------------------
if [ "$RUN_BACKEND" = true ]; then
  if ! docker compose ps db --format json 2>/dev/null | grep -q '"State":"running"'; then
    info "Postgres não está rodando. Subindo via docker compose..."
    docker compose up -d db

    # Espera healthcheck
    for i in $(seq 1 30); do
      if docker compose ps db --format json 2>/dev/null | grep -q '"Health":"healthy"'; then
        success "Postgres pronto"
        break
      fi
      sleep 1
    done
  fi
fi

# ------------------------------------------------------------
# Função de cleanup: mata todos os processos filhos em Ctrl+C
# ------------------------------------------------------------
PIDS=()

cleanup() {
  echo -e "\n${YELLOW}Encerrando processos...${NC}"
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  wait 2>/dev/null || true
  success "Encerrado"
  exit 0
}

trap cleanup INT TERM

# ------------------------------------------------------------
# Função para prefixar output de um comando
# ------------------------------------------------------------
# Recebe: prefixo, cor, comando
# Adiciona o prefixo colorido a cada linha de stdout/stderr
prefix_output() {
  local prefix=$1
  local color=$2
  shift 2
  "$@" 2>&1 | while IFS= read -r line; do
    echo -e "${color}${prefix}${NC} ${line}"
  done
}

# ------------------------------------------------------------
# Subir backend
# ------------------------------------------------------------
if [ "$RUN_BACKEND" = true ]; then
  info "Subindo backend em http://localhost:8000"
  (
    cd apps/backend
    prefix_output "[backend] " "$CYAN" uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
  ) &
  PIDS+=($!)
fi

# ------------------------------------------------------------
# Subir frontend
# ------------------------------------------------------------
if [ "$RUN_FRONTEND" = true ]; then
  # Pequeno delay para o backend começar a escutar antes do frontend
  # tentar gerar tipos ou fazer requests
  if [ "$RUN_BACKEND" = true ]; then
    sleep 2
  fi

  info "Subindo frontend em http://localhost:5173"
  (
    cd apps/frontend
    prefix_output "[frontend]" "$MAGENTA" npm run dev
  ) &
  PIDS+=($!)
fi

# ------------------------------------------------------------
# Espera
# ------------------------------------------------------------
echo ""
success "Servindo. Ctrl+C para encerrar tudo."
echo ""

wait
