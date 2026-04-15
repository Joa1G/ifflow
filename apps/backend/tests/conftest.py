import os

# Defaults seguros para a suíte de testes. Setados ANTES de qualquer import de
# `app.*` para que `app.config.Settings` (avaliado no nível do módulo) carregue
# sem precisar de .env real. Cada teste pode sobrescrever via monkeypatch.
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test_db")
os.environ.setdefault("JWT_SECRET", "test-secret-with-at-least-32-characters-xx")
os.environ.setdefault("FRONTEND_URL", "http://localhost:5173")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture()
def client():
    return TestClient(app)
