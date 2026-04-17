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
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402
from sqlmodel import Session, SQLModel  # noqa: E402

from app.database import get_session  # noqa: E402
from app.main import app  # noqa: E402

# Engine unica para todos os testes de integracao. StaticPool garante que a
# mesma conexao in-memory e reutilizada entre threads (TestClient roda requests
# numa thread separada). check_same_thread=False e necessario para SQLite.
_test_engine = create_engine(
    "sqlite://",
    echo=False,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)


@pytest.fixture()
def session():
    """Sessao SQLite in-memory isolada por teste."""
    SQLModel.metadata.create_all(_test_engine)
    with Session(_test_engine) as s:
        yield s
    SQLModel.metadata.drop_all(_test_engine)


@pytest.fixture()
def client(session: Session):
    """TestClient que usa o banco de teste em vez do Postgres real."""

    def _override_get_session():
        yield session

    app.dependency_overrides[get_session] = _override_get_session
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    """Zera o storage do slowapi entre testes.

    Como o Limiter e um singleton em app.state compartilhado pela FastAPI app,
    e o TestClient sempre se apresenta como o mesmo IP, sem reset um teste
    anterior pode fazer o proximo estourar o limite inesperadamente.
    """
    from app.routers.auth import limiter

    limiter.reset()
    yield
    limiter.reset()
