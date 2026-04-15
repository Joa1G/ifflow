#!/usr/bin/env bash
# ============================================================
# IFFLOW — setup.sh
# ============================================================
# Setup inicial do monorepo após clonar pela primeira vez.
#
# O que este script faz (em ordem):
#   1. Verifica pré-requisitos (uv, node, docker)
#   2. Cria .env a partir de .env.example (se não existir)
#   3. Sobe o Postgres via docker compose
#   4. Instala dependências do backend com uv
#   5. Aplica migrations do Alembic
#   6. Cria o super_admin inicial
#   7. Instala dependências do frontend com npm
#   8. Gera os tipos TypeScript iniciais da API
#
# Uso:
#   ./scripts/setup.sh
#
# Para rodar passos específicos depois:
#   ./scripts/setup.sh --skip-deps      # pula instalação de deps
#   ./scripts/setup.sh --reset-db       # apaga o banco antes
# ============================================================

set -euo pipefail

# ------------------------------------------------------------
# Cores para output
# ------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

info()    { echo -e "${BLUE}ℹ${NC}  $*"; }
success() { echo -e "${GREEN}✓${NC}  $*"; }
warn()    { echo -e "${YELLOW}⚠${NC}  $*"; }
error()   { echo -e "${RED}✗${NC}  $*" >&2; }
step()    { echo -e "\n${BOLD}${BLUE}▸ $*${NC}"; }

# ------------------------------------------------------------
# Descobrir raiz do monorepo
# ------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# ------------------------------------------------------------
# Parse de flags
# ------------------------------------------------------------
SKIP_DEPS=false
RESET_DB=false
for arg in "$@"; do
  case $arg in
    --skip-deps) SKIP_DEPS=true ;;
    --reset-db)  RESET_DB=true ;;
    --help|-h)
      sed -n '2,25p' "$0"
      exit 0
      ;;
    *)
      error "Argumento desconhecido: $arg"
      exit 1
      ;;
  esac
done

echo -e "${BOLD}"
echo "╔═══════════════════════════════════════╗"
echo "║       IFFLOW — Setup inicial          ║"
echo "╚═══════════════════════════════════════╝"
echo -e "${NC}"

# ------------------------------------------------------------
# 1. Verificar pré-requisitos
# ------------------------------------------------------------
step "1/8  Verificando pré-requisitos"

check_command() {
  local cmd=$1
  local install_hint=$2
  if ! command -v "$cmd" &>/dev/null; then
    error "'$cmd' não encontrado. $install_hint"
    return 1
  fi
  success "$cmd instalado: $($cmd --version 2>&1 | head -n1)"
}

MISSING=0
check_command uv     "Instale com: curl -LsSf https://astral.sh/uv/install.sh | sh" || MISSING=1
check_command node   "Instale Node.js 20+ em https://nodejs.org" || MISSING=1
check_command npm    "Deveria vir junto com o Node.js" || MISSING=1
check_command docker "Instale Docker Desktop em https://www.docker.com" || MISSING=1

if [ $MISSING -eq 1 ]; then
  error "Instale as dependências acima e rode ./scripts/setup.sh novamente."
  exit 1
fi

# Verifica versão do Node
NODE_MAJOR=$(node --version | sed 's/v\([0-9]*\).*/\1/')
if [ "$NODE_MAJOR" -lt 20 ]; then
  error "Node.js 20+ é necessário. Versão atual: $(node --version)"
  exit 1
fi

# Verifica se Docker está rodando
if ! docker info &>/dev/null; then
  error "Docker não está rodando. Abra o Docker Desktop e tente novamente."
  exit 1
fi

# ------------------------------------------------------------
# 2. Criar .env
# ------------------------------------------------------------
step "2/8  Configurando variáveis de ambiente"

if [ ! -f .env ]; then
  cp .env.example .env
  success "Criado .env a partir de .env.example"
  warn "IMPORTANTE: edite .env e gere um JWT_SECRET real antes de rodar em produção."
  warn "Para dev, os valores padrão funcionam."
else
  info ".env já existe, não sobrescrevendo"
fi

# ------------------------------------------------------------
# 3. Subir Postgres
# ------------------------------------------------------------
step "3/8  Subindo Postgres via Docker Compose"

if [ "$RESET_DB" = true ]; then
  warn "Flag --reset-db passada. Apagando volume do banco..."
  docker compose down -v 2>/dev/null || true
fi

docker compose up -d db
info "Aguardando Postgres ficar pronto..."

# Espera healthcheck do docker compose
MAX_WAIT=30
for i in $(seq 1 $MAX_WAIT); do
  if docker compose ps db --format json 2>/dev/null | grep -q '"Health":"healthy"'; then
    success "Postgres pronto"
    break
  fi
  if [ "$i" -eq "$MAX_WAIT" ]; then
    error "Postgres não ficou pronto em ${MAX_WAIT}s. Rode: docker compose logs db"
    exit 1
  fi
  sleep 1
done

# ------------------------------------------------------------
# 4. Instalar dependências do backend
# ------------------------------------------------------------
step "4/8  Instalando dependências do backend (uv)"

if [ "$SKIP_DEPS" = false ]; then
  cd apps/backend
  uv sync
  success "Dependências do backend instaladas"
  cd "$REPO_ROOT"
else
  info "Pulando (--skip-deps)"
fi

# ------------------------------------------------------------
# 5. Aplicar migrations
# ------------------------------------------------------------
step "5/8  Aplicando migrations do Alembic"

cd apps/backend
uv run alembic upgrade head
success "Migrations aplicadas"
cd "$REPO_ROOT"

# ------------------------------------------------------------
# 6. Criar super_admin inicial
# ------------------------------------------------------------
step "6/8  Criando super_admin inicial"

cd apps/backend
if uv run python -m app.scripts.seed_super_admin; then
  success "super_admin criado ou já existente"
else
  warn "Script de seed falhou. Rode manualmente depois:"
  warn "  cd apps/backend && uv run python -m app.scripts.seed_super_admin"
fi
cd "$REPO_ROOT"

# ------------------------------------------------------------
# 7. Instalar dependências do frontend
# ------------------------------------------------------------
step "7/8  Instalando dependências do frontend (npm)"

if [ "$SKIP_DEPS" = false ]; then
  cd apps/frontend
  npm install
  success "Dependências do frontend instaladas"
  cd "$REPO_ROOT"
else
  info "Pulando (--skip-deps)"
fi

# ------------------------------------------------------------
# 8. Gerar tipos iniciais da API
# ------------------------------------------------------------
step "8/8  Gerando tipos TypeScript da API"

if [ -x ./scripts/sync-api-types.sh ]; then
  ./scripts/sync-api-types.sh || {
    warn "Geração de tipos falhou. Rode manualmente depois:"
    warn "  ./scripts/sync-api-types.sh"
  }
else
  warn "./scripts/sync-api-types.sh não encontrado ou não executável. Pulando."
fi

# ------------------------------------------------------------
# Finalização
# ------------------------------------------------------------
echo -e "\n${BOLD}${GREEN}╔═══════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║       Setup concluído com sucesso     ║${NC}"
echo -e "${BOLD}${GREEN}╚═══════════════════════════════════════╝${NC}\n"

echo "Próximos passos:"
echo ""
echo "  1. Revise o .env (especialmente JWT_SECRET em produção)"
echo "  2. Rode ./scripts/dev.sh para subir backend + frontend juntos"
echo "  3. Abra http://localhost:5173 no navegador"
echo ""
echo "Comandos úteis:"
echo ""
echo "  ./scripts/dev.sh              # sobe backend + frontend"
echo "  ./scripts/sync-api-types.sh   # regenera tipos do frontend"
echo "  docker compose logs -f db     # logs do Postgres"
echo "  docker compose down           # para o Postgres"
echo ""
