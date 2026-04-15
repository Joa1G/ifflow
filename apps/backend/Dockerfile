# ============================================================
# IFFLOW Backend — Dockerfile multi-stage
# ============================================================
# Build: docker build -t ifflow-backend .
# Run:   docker run -p 8000:8000 --env-file ../../.env ifflow-backend
# ============================================================

# --- Stage 1: build (instala dependências) ---
FROM python:3.12-slim AS builder

WORKDIR /build

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

COPY pyproject.toml uv.lock ./

RUN uv sync --frozen --no-dev --no-install-project

COPY app/ app/

# --- Stage 2: runtime (imagem final enxuta) ---
FROM python:3.12-slim AS runtime

WORKDIR /app

RUN addgroup --system app && adduser --system --ingroup app app

COPY --from=builder /build/.venv /app/.venv
COPY --from=builder /build/app /app/app

# Alembic precisa estar disponível para migrations no deploy
COPY alembic/ /app/alembic/
COPY alembic.ini /app/alembic.ini

ENV PATH="/app/.venv/bin:$PATH"

USER app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
