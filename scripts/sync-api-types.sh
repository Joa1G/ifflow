#!/usr/bin/env bash
# ============================================================
# IFFLOW — sync-api-types.sh
# ============================================================
# Regenera apps/frontend/src/types/api.ts a partir do OpenAPI
# exposto pelo backend em /openapi.json.
#
# Este script é a ÚNICA forma correta de atualizar os tipos
# da API no frontend. Nunca edite api.ts à mão.
#
# Como funciona:
#   1. Detecta se o backend já está rodando em localhost:8000
#   2. Se não estiver, sobe ele temporariamente em background
#   3. Baixa /openapi.json
#   4. Roda openapi-typescript para gerar api.ts
#   5. Se subiu o backend, encerra ele antes de sair
#
# Uso:
#   ./scripts/sync-api-types.sh
#
# Quando rodar:
#   - Antes de começar uma task F-XX com "requires backend"
#   - Depois de mergear uma task B-XX que tocou em endpoint
#   - Sempre que o TypeScript reclamar de tipo ausente
# ============================================================

set -euo pipefail

# ------------------------------------------------------------
# Cores
# ------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

BACKEND_URL="http://localhost:8000"
OPENAPI_URL="${BACKEND_URL}/openapi.json"
OUTPUT_FILE="apps/frontend/src/types/api.ts"

echo -e "${BOLD}Sincronizando tipos da API...${NC}\n"

# ------------------------------------------------------------
# Verificar pré-requisitos
# ------------------------------------------------------------
if ! command -v npx &>/dev/null; then
  error "'npx' não encontrado. Instale Node.js 20+."
  exit 1
fi

if ! command -v curl &>/dev/null; then
  error "'curl' não encontrado. Instale curl."
  exit 1
fi

# ------------------------------------------------------------
# Verificar se backend já está rodando
# ------------------------------------------------------------
BACKEND_STARTED_BY_US=false
BACKEND_PID=""

check_backend() {
  curl -sf --max-time 2 "${BACKEND_URL}/health" >/dev/null 2>&1
}

if check_backend; then
  info "Backend já está rodando em ${BACKEND_URL}"
else
  info "Backend não está rodando. Subindo temporariamente..."

  # Verifica se Postgres está up (o backend precisa dele)
  if ! docker compose ps db --format json 2>/dev/null | grep -q '"State":"running"'; then
    warn "Postgres não está rodando. Subindo..."
    docker compose up -d db
    sleep 3
  fi

  # Sobe o backend em background, silencioso
  (
    cd apps/backend
    uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 \
      >/tmp/ifflow-backend-sync.log 2>&1
  ) &
  BACKEND_PID=$!
  BACKEND_STARTED_BY_US=true

  # Espera backend subir
  info "Aguardando backend responder..."
  for i in $(seq 1 30); do
    if check_backend; then
      success "Backend pronto"
      break
    fi
    if [ "$i" -eq 30 ]; then
      error "Backend não subiu em 30s. Logs em /tmp/ifflow-backend-sync.log"
      kill "$BACKEND_PID" 2>/dev/null || true
      exit 1
    fi
    sleep 1
  done
fi

# ------------------------------------------------------------
# Função de cleanup: mata o backend se nós subimos
# ------------------------------------------------------------
cleanup() {
  if [ "$BACKEND_STARTED_BY_US" = true ] && [ -n "$BACKEND_PID" ]; then
    info "Encerrando backend temporário..."
    kill "$BACKEND_PID" 2>/dev/null || true
    wait "$BACKEND_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# ------------------------------------------------------------
# Verificar se o endpoint /openapi.json responde
# ------------------------------------------------------------
if ! curl -sf "${OPENAPI_URL}" -o /tmp/ifflow-openapi.json; then
  error "Falha ao buscar ${OPENAPI_URL}"
  exit 1
fi
success "OpenAPI schema baixado"

# ------------------------------------------------------------
# Garantir que a pasta de tipos existe
# ------------------------------------------------------------
mkdir -p "$(dirname "$OUTPUT_FILE")"

# ------------------------------------------------------------
# Gerar tipos com openapi-typescript
# ------------------------------------------------------------
info "Gerando $OUTPUT_FILE..."

# Usa openapi-typescript via npx (baixa sob demanda se não instalado)
# Passa --enum para gerar enums como tipos TypeScript enum em vez de union
npx --yes openapi-typescript "${OPENAPI_URL}" -o "$OUTPUT_FILE"

# Adiciona cabeçalho de aviso no topo do arquivo
TMP_FILE=$(mktemp)
cat > "$TMP_FILE" <<'EOF'
/**
 * ============================================================
 * ARQUIVO GERADO AUTOMATICAMENTE — NÃO EDITAR À MÃO
 * ============================================================
 * Fonte: backend FastAPI /openapi.json
 * Regenere com: ./scripts/sync-api-types.sh
 *
 * Se você editar este arquivo, suas mudanças serão perdidas
 * na próxima sincronização. Para ajustar tipos da API, altere
 * o schema Pydantic no backend e rode o script novamente.
 * ============================================================
 */

EOF
cat "$OUTPUT_FILE" >> "$TMP_FILE"
mv "$TMP_FILE" "$OUTPUT_FILE"

success "Tipos gerados em $OUTPUT_FILE"

# ------------------------------------------------------------
# Relatório final
# ------------------------------------------------------------
LINE_COUNT=$(wc -l < "$OUTPUT_FILE" | tr -d ' ')
SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)

echo ""
echo -e "${BOLD}Resumo:${NC}"
echo "  Arquivo:  $OUTPUT_FILE"
echo "  Linhas:   $LINE_COUNT"
echo "  Tamanho:  $SIZE"
echo ""
success "Sincronização concluída"
echo ""
info "Não esqueça de commitar $OUTPUT_FILE junto com sua task se ela adicionou endpoints."
