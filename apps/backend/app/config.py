from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict

# .env único na raiz do monorepo (ifflow/.env), compartilhado entre backend e
# frontend. Resolução por caminho absoluto evita depender do CWD do processo.
ENV_FILE = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        case_sensitive=False,
        # Ignora variáveis VITE_* (e quaisquer outras do frontend) presentes
        # no .env compartilhado.
        extra="ignore",
    )

    environment: Literal["development", "test", "production"] = "development"

    database_url: str
    jwt_secret: str = Field(min_length=32)
    jwt_expiration_hours: int = 24

    resend_api_key: str = ""
    email_from: str = "IFFLOW <noreply@ifflow.local>"

    frontend_url: str = "http://localhost:5173"


@lru_cache(maxsize=1)
def get_settings() -> "Settings":
    try:
        return Settings()  # type: ignore[call-arg]
    except ValidationError as exc:
        raise RuntimeError(
            "Falha ao carregar configurações do backend.\n"
            f"Arquivo .env esperado em: {ENV_FILE}\n"
            "Copie .env.example para .env na raiz do monorepo e preencha "
            "as variáveis obrigatórias.\n\n"
            f"Detalhes da validação:\n{exc}"
        ) from exc


settings = get_settings()
