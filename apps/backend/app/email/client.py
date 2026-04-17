"""Cliente de envio de email.

Em producao (`ENVIRONMENT=production`) com `RESEND_API_KEY` configurado,
envia pela API do Resend. Em `ENVIRONMENT=test` (e em dev sem chave), grava
em uma lista em memoria que os testes inspecionam via `get_sent_emails()`.

Falhas de envio em producao sao LOGADAS mas NAO re-levantadas (ADR-013):
email e side effect nao-critico, a acao principal (aprovar cadastro, emitir
token de reset, etc) ja foi persistida antes da chamada.
"""

import logging
from dataclasses import dataclass

import resend

from app.config import settings

logger = logging.getLogger(__name__)


@dataclass
class SentEmail:
    to: str
    subject: str
    html: str
    from_: str


# Lista module-level usada nos modos mockados (test / dev sem chave). Testes
# inspecionam via get_sent_emails() e limpam entre execucoes via fixture.
_SENT_EMAILS: list[SentEmail] = []


def _should_mock() -> bool:
    """Decide se o envio e mockado.

    - ENVIRONMENT=test: sempre mock (suite nunca bate na API real).
    - ENVIRONMENT=development com RESEND_API_KEY vazio: mock (comportamento
      documentado em .env.example para facilitar o setup local).
    - Caso contrario: envio real.
    """
    if settings.environment == "test":
        return True
    if settings.environment == "development" and not settings.resend_api_key:
        return True
    return False


def send_email(to: str, subject: str, html: str) -> None:
    """Envia um email transacional.

    Nao levanta excecao se o envio falhar em producao — so loga. Quem chama
    assume que o email e best-effort.
    """
    sent = SentEmail(to=to, subject=subject, html=html, from_=settings.email_from)

    if _should_mock():
        _SENT_EMAILS.append(sent)
        logger.debug("Email mockado (nao enviado): to=%s subject=%s", to, subject)
        return

    resend.api_key = settings.resend_api_key
    try:
        resend.Emails.send(
            {
                "from": settings.email_from,
                "to": to,
                "subject": subject,
                "html": html,
            }
        )
    except Exception:
        # Nao propagar: a acao principal (aprovar, resetar senha) ja foi
        # persistida. Falha de email e operacional, nao de negocio.
        logger.exception("Falha ao enviar email via Resend para %s", to)


def get_sent_emails() -> list[SentEmail]:
    """Retorna a lista de emails capturados em modo mockado.

    Uso exclusivo em testes e debugging local. Em producao a lista fica
    sempre vazia.
    """
    return list(_SENT_EMAILS)


def clear_sent_emails() -> None:
    """Limpa a lista de emails capturados. Usar entre testes."""
    _SENT_EMAILS.clear()
