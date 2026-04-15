import importlib

import pytest
from pydantic import ValidationError

from app import config as config_module


@pytest.fixture(autouse=True)
def _clear_settings_cache():
    """Limpa o cache do get_settings entre testes, já que ele usa lru_cache."""
    config_module.get_settings.cache_clear()
    yield
    config_module.get_settings.cache_clear()


def _reload_with_env(monkeypatch: pytest.MonkeyPatch, env: dict[str, str]):
    # Isola o teste de qualquer .env real do ambiente: pydantic-settings só lê
    # env vars do processo se a variável estiver setada — limpamos as nossas
    # antes para garantir reprodutibilidade.
    for key in (
        "ENVIRONMENT",
        "DATABASE_URL",
        "JWT_SECRET",
        "JWT_EXPIRATION_HOURS",
        "RESEND_API_KEY",
        "EMAIL_FROM",
        "FRONTEND_URL",
    ):
        monkeypatch.delenv(key, raising=False)
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    # Aponta o env_file para um arquivo inexistente para evitar contaminação
    # pelo .env real do dev.
    monkeypatch.setattr(
        config_module.Settings,
        "model_config",
        {**config_module.Settings.model_config, "env_file": "/tmp/__ifflow_no_env__"},
    )


def test_settings_loads_with_required_env(monkeypatch):
    _reload_with_env(
        monkeypatch,
        {
            "DATABASE_URL": "postgresql://test:test@localhost:5432/test_db",
            "JWT_SECRET": "a" * 32,
            "ENVIRONMENT": "test",
            "FRONTEND_URL": "http://localhost:5173",
        },
    )

    settings = config_module.Settings()  # type: ignore[call-arg]

    assert settings.database_url == "postgresql://test:test@localhost:5432/test_db"
    assert settings.jwt_secret == "a" * 32
    assert settings.environment == "test"
    assert settings.jwt_expiration_hours == 24


def test_settings_rejects_short_jwt_secret(monkeypatch):
    _reload_with_env(
        monkeypatch,
        {
            "DATABASE_URL": "postgresql://test:test@localhost:5432/test_db",
            "JWT_SECRET": "short",
        },
    )

    with pytest.raises(ValidationError):
        config_module.Settings()  # type: ignore[call-arg]


def test_settings_rejects_missing_database_url(monkeypatch):
    _reload_with_env(monkeypatch, {"JWT_SECRET": "a" * 32})

    with pytest.raises(ValidationError):
        config_module.Settings()  # type: ignore[call-arg]


def test_get_settings_wraps_validation_error_with_friendly_message(monkeypatch):
    _reload_with_env(monkeypatch, {})

    with pytest.raises(RuntimeError) as exc_info:
        config_module.get_settings()

    message = str(exc_info.value)
    assert "Falha ao carregar configurações" in message
    assert ".env" in message
    # Mensagem deve apontar o caminho exato esperado.
    assert str(config_module.ENV_FILE) in message


def test_settings_ignores_vite_variables(monkeypatch):
    """O .env é compartilhado com o frontend; VITE_* não deve quebrar o load."""
    _reload_with_env(
        monkeypatch,
        {
            "DATABASE_URL": "postgresql://test:test@localhost:5432/test_db",
            "JWT_SECRET": "a" * 32,
            "VITE_API_URL": "http://localhost:8000",
        },
    )

    settings = config_module.Settings()  # type: ignore[call-arg]
    assert settings.database_url.startswith("postgresql://")
    assert not hasattr(settings, "vite_api_url")


def test_module_level_settings_is_singleton():
    # Reimporta o módulo sem limpar variáveis para garantir que `settings`
    # exposto no módulo é resultado do mesmo get_settings cacheado.
    reloaded = importlib.reload(config_module)
    assert reloaded.settings is reloaded.get_settings()
